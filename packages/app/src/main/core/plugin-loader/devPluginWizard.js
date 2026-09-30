import fs from 'node:fs';
import path from 'node:path';

/**
 * 开发插件的创建（脚手架）与引入（本地目录链接）逻辑。
 *
 * 供宿主内「创建/引入开发插件」向导的 IPC 入口调用，替代
 * 源码仓库中的 `.agents/plugin-scaffold/create-plugin.mjs`，
 * 让不克隆本仓库的开发者也能在安装版宿主里完成创建与链接。
 *
 * 本模块保持纯净：不依赖 Electron，所有目录均由调用方显式传入，
 * 便于在临时目录中做真实文件系统测试；模板目录解析与 loader
 * 联动见 `ipcHandler.js`。
 */

const PLUGIN_NAME_PATTERN = /^translime-plugin-[a-z0-9-]+$/;
const TEMPLATE_NAME_PLACEHOLDER = 'translime-plugin-example';
// 生成的插件包通过 npm 安装 SDK；与宿主 0.6.x 配套的 SDK 为 1.x，
// 随模板一起随宿主版本更新
const SDK_VERSION_RANGE = '^1.1.0';
const TEMPLATE_SDK_DEP = 'translime-sdk';
const TEMPLATE_SDK_WORKSPACE_SPEC = 'workspace:*';

// 与脚手架 create-plugin.mjs 保持同一份占位符约定
const TEXT_FILE_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.vue',
  '.html',
  '.css',
  '.yml',
  '.yaml',
  '.txt',
]);
const SKIPPED_TEMPLATE_ENTRIES = new Set([
  'node_modules',
  'dist',
]);

/**
 * 校验新插件的包名是否符合命名约定。
 *
 * @param {string} name - 待校验的插件包名。
 * @returns {boolean} 是否合法。
 */
const isCreatePluginName = (name) => PLUGIN_NAME_PATTERN.test(String(name || ''));

/**
 * 由包名推导默认展示标题，如 `translime-plugin-foo-bar` → `Foo Bar`。
 *
 * @param {string} name - 插件包名。
 * @returns {string} 展示标题。
 */
const toPluginTitle = (name) => String(name || '')
  .replace(/^translime-plugin-/, '')
  .split('-')
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

/**
 * 构建模板占位符替换表，与脚手架 create-plugin.mjs 保持一致。
 *
 * @param {object} options - 替换参数。
 * @param {string} options.name - 插件包名。
 * @param {string} [options.title] - 展示标题，缺省由包名推导。
 * @param {string} [options.description] - 功能描述，缺省由标题推导。
 * @returns {Array<[string, string]>} 替换对数组。
 */
const buildTemplateReplacements = ({ name, title, description }) => {
  const safeTitle = title || toPluginTitle(name);
  const safeDescription = description || `${safeTitle} plugin`;
  return [
    [TEMPLATE_NAME_PLACEHOLDER, name],
    ['plugin title', safeTitle],
    ['plugin description', safeDescription],
    ['a plugin example', safeDescription],
    ['UiExample', `${safeTitle.replace(/\s+/g, '')}Ui`],
  ];
};

const replaceInContent = (content, replacements) => replacements.reduce(
  (acc, [from, to]) => acc.split(from).join(to),
  content,
);

/**
 * 递归复制模板目录，跳过 node_modules 与 dist；
 * 文本文件做占位符替换，其余文件按二进制原样复制。
 *
 * 逐文件 readFileSync/writeFileSync 而非 cpSync，
 * 保证打包后从 asar 内读取模板也能正常工作。
 *
 * @param {object} options - 复制参数。
 * @param {string} options.templateDir - 模板目录。
 * @param {string} options.targetDir - 目标目录（必须不存在）。
 * @param {Array<[string, string]>} options.replacements - 占位符替换表。
 * @returns {number} 复制的文件数量。
 */
const copyTemplateFiles = ({ templateDir, targetDir, replacements }) => {
  fs.mkdirSync(targetDir, { recursive: true });

  return fs.readdirSync(templateDir, { withFileTypes: true }).reduce((copied, entry) => {
    const sourcePath = path.join(templateDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      if (SKIPPED_TEMPLATE_ENTRIES.has(entry.name)) {
        return copied;
      }
      return copied + copyTemplateFiles({
        templateDir: sourcePath,
        targetDir: targetPath,
        replacements,
      });
    }
    if (!entry.isFile()) {
      return copied;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (TEXT_FILE_EXTENSIONS.has(ext)) {
      const content = fs.readFileSync(sourcePath, 'utf8');
      fs.writeFileSync(targetPath, replaceInContent(content, replacements), 'utf8');
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
    return copied + 1;
  }, 0);
};

/**
 * 把生成的 package.json 落盘：写回真实包名与元数据，
 * 并把模板中的 `translime-sdk: workspace:*` 改写为 npm 版本范围。
 *
 * @param {string} pluginDir - 已生成的插件目录。
 * @param {object} options - 元数据。
 * @param {string} options.name - 插件包名。
 * @param {string} options.title - 展示标题。
 * @param {string} options.description - 功能描述。
 * @returns {void}
 */
const finalizePackageJson = (pluginDir, { name, title, description }) => {
  const packageJsonPath = path.join(pluginDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  packageJson.name = name;
  if (packageJson.plugin) {
    packageJson.plugin.title = title;
    packageJson.plugin.description = description;
  }
  if (packageJson.devDependencies?.[TEMPLATE_SDK_DEP] === TEMPLATE_SDK_WORKSPACE_SPEC) {
    packageJson.devDependencies[TEMPLATE_SDK_DEP] = SDK_VERSION_RANGE;
  }

  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
};

/**
 * 在宿主开发插件目录下创建指向插件项目的链接。
 *
 * Windows 使用 junction（无需管理员权限），其余平台使用目录符号链接；
 * 已存在同名链接且指向同一目录时视为成功，指向不同目录时抛错，
 * 避免静默覆盖开发者已有的链接。
 *
 * @param {object} options - 链接参数。
 * @param {string} options.pluginDir - 插件项目目录。
 * @param {string} options.devModulesPath - 宿主开发插件 node_modules 目录。
 * @param {string} options.pluginName - 插件包名（链接名）。
 * @returns {string} 链接路径。
 */
const createDevPluginLink = ({ pluginDir, devModulesPath, pluginName }) => {
  const linkPath = path.join(devModulesPath, pluginName);
  const resolvedPluginDir = path.resolve(pluginDir);

  if (fs.existsSync(linkPath)) {
    let existingTarget = '';
    try {
      existingTarget = fs.readlinkSync(linkPath);
    } catch (err) {
      existingTarget = '';
    }
    if (existingTarget && path.resolve(existingTarget) === resolvedPluginDir) {
      return linkPath;
    }
    throw new Error(`开发插件目录已存在同名条目 "${pluginName}"，请先手动处理后重试`);
  }

  fs.mkdirSync(devModulesPath, { recursive: true });
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(resolvedPluginDir, linkPath, linkType);
  return linkPath;
};

/**
 * 用模板在指定目录生成一个新插件项目，并链接进宿主开发插件目录。
 *
 * @param {object} options - 创建参数。
 * @param {string} options.templateDir - 模板目录（宿主内置资源）。
 * @param {string} options.targetDir - 新插件项目目录（必须不存在）。
 * @param {string} options.devModulesPath - 宿主开发插件 node_modules 目录。
 * @param {string} options.name - 插件包名。
 * @param {string} [options.title] - 展示标题。
 * @param {string} [options.description] - 功能描述。
 * @returns {{packageName: string, pluginDir: string, linkPath: string}} 创建结果。
 */
const createDevPlugin = ({
  templateDir,
  targetDir,
  devModulesPath,
  name,
  title,
  description,
}) => {
  const safeName = String(name || '');
  if (!isCreatePluginName(safeName)) {
    throw new Error(`非法的插件包名 "${safeName}"，需以 translime-plugin- 开头且仅含小写字母、数字与连字符`);
  }
  if (!fs.existsSync(templateDir)) {
    throw new Error('未找到内置插件模板，宿主安装可能不完整');
  }
  if (fs.existsSync(targetDir)) {
    throw new Error(`目标目录已存在：${targetDir}`);
  }

  const safeTitle = (title || '').trim() || toPluginTitle(safeName);
  const safeDescription = (description || '').trim() || `${safeTitle} plugin`;
  const replacements = buildTemplateReplacements({
    name: safeName,
    title: safeTitle,
    description: safeDescription,
  });

  fs.mkdirSync(path.dirname(path.resolve(targetDir)), { recursive: true });
  copyTemplateFiles({ templateDir, targetDir, replacements });
  finalizePackageJson(targetDir, {
    name: safeName,
    title: safeTitle,
    description: safeDescription,
  });

  const linkPath = createDevPluginLink({
    pluginDir: targetDir,
    devModulesPath,
    pluginName: safeName,
  });
  return { packageName: safeName, pluginDir: path.resolve(targetDir), linkPath };
};

/**
 * 校验一个本地目录是否是可引入的插件项目。
 *
 * @param {string} sourceDir - 待引入的插件目录。
 * @returns {{name: string, plugin: object}} package.json 关键信息。
 */
const readLinkablePluginManifest = (sourceDir) => {
  const manifestPath = path.join(sourceDir, 'package.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('所选目录中未找到 package.json');
  }

  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    throw new Error('package.json 解析失败，请检查文件内容');
  }

  if (!isCreatePluginName(packageJson.name)) {
    throw new Error(`插件包名 "${packageJson.name}" 不符合 translime-plugin- 命名约定`);
  }
  if (!packageJson.plugin || typeof packageJson.plugin !== 'object') {
    throw new Error('package.json 缺少 plugin 字段，无法作为插件引入');
  }
  return packageJson;
};

/**
 * 把一个已存在的本地插件项目链接进宿主开发插件目录。
 *
 * @param {object} options - 引入参数。
 * @param {string} options.sourceDir - 插件项目目录。
 * @param {string} options.devModulesPath - 宿主开发插件 node_modules 目录。
 * @returns {{packageName: string, pluginDir: string, linkPath: string}} 引入结果。
 */
const linkDevPlugin = ({ sourceDir, devModulesPath }) => {
  const resolvedSourceDir = path.resolve(sourceDir);
  if (!fs.existsSync(resolvedSourceDir) || !fs.statSync(resolvedSourceDir).isDirectory()) {
    throw new Error(`插件目录不存在：${resolvedSourceDir}`);
  }

  const packageJson = readLinkablePluginManifest(resolvedSourceDir);
  const linkPath = createDevPluginLink({
    pluginDir: resolvedSourceDir,
    devModulesPath,
    pluginName: packageJson.name,
  });
  return {
    packageName: packageJson.name,
    pluginDir: resolvedSourceDir,
    linkPath,
  };
};

export {
  SDK_VERSION_RANGE,
  buildTemplateReplacements,
  copyTemplateFiles,
  createDevPlugin,
  createDevPluginLink,
  isCreatePluginName,
  linkDevPlugin,
  readLinkablePluginManifest,
  toPluginTitle,
};
