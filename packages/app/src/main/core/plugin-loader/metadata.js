import fs from 'node:fs';
import path from 'node:path';
import mainStore from '../../utils/useMainStore';
import readPackageManifest from '../../utils/readPackageManifest';
import {
  ACTIVATION_ON_COMMAND_PREFIX,
  ACTIVATION_ON_IPC_PREFIX,
  ACTIVATION_ON_STARTUP,
  ACTIVATION_ON_VIEW,
  PLUGIN_SOURCE_DEV,
  PLUGIN_SOURCE_RELEASE,
  PLUGIN_STATUS_ACTIVATING,
  PLUGIN_STATUS_ACTIVE,
  PLUGIN_STATUS_BLOCKED,
  PLUGIN_STATUS_BUILD_MISSING,
  PLUGIN_STATUS_DISCOVERED,
  PLUGIN_STATUS_LOAD_ERROR,
  PLUGIN_STATUS_READY,
} from './constants';

/**
 * 插件元数据读取与标准化工具。
 *
 * 这一层只处理“读出来的插件长什么样”，不参与安装、启停与 UI。
 * 目标是把来源不完全一致的插件描述统一整理成运行期可依赖的数据结构。
 */

/**
 * 同步判断文件或目录是否存在。
 *
 * @param {string} targetPath - 待检查的目标路径。
 * @returns {boolean} 路径是否可访问。
 */
const pathExists = (targetPath) => {
  try {
    fs.accessSync(targetPath);
    return true;
  } catch (err) {
    return false;
  }
};

/**
 * 将单值、数组或空值统一转成数组。
 *
 * @param {any} value - 原始输入值。
 * @returns {Array<any>} 归一化后的数组。
 */
const toArray = (value) => {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

/**
 * 提取唯一、非空的字符串数组。
 *
 * @param {any} value - 单值或数组形式的原始输入。
 * @returns {Array<string>} 去重后的字符串列表。
 */
const uniqueStrings = (value) => Array.from(new Set(
  toArray(value)
    .map((item) => String(item).trim())
    .filter(Boolean),
));

/**
 * 规范化插件激活事件配置。
 *
 * 当插件没有声明激活条件时，默认视为 `onStartup`。
 *
 * @param {any} activationEvents - 插件原始激活事件定义。
 * @returns {Array<string>} 标准化后的激活事件列表。
 */
const normalizeActivationEvents = (activationEvents) => {
  const normalized = uniqueStrings(activationEvents);
  if (!normalized.length) {
    return [ACTIVATION_ON_STARTUP];
  }
  return normalized;
};

/**
 * 规范化 `contributes.commands` 配置。
 *
 * @param {any} commands - 插件声明的命令列表。
 * @returns {Array<{id: string, title: string}>} 清洗后的命令元数据。
 */
const normalizeCommands = (commands) => toArray(commands)
  .map((command) => {
    if (!command || !command.id) {
      return null;
    }
    return {
      id: String(command.id),
      title: command.title ? String(command.title) : String(command.id),
    };
  })
  .filter(Boolean);

/**
 * 从激活事件列表中解析 IPC 与命令懒激活索引。
 *
 * @param {Array<string>} activationEvents - 已标准化的激活事件列表。
 * @returns {{ipcActivationTypes: Array<string>, commandActivationIds: Array<string>}}
 * 用于运行期建立索引的附加元数据。
 */
const parseActivationMeta = (activationEvents) => {
  const ipcActivationTypes = [];
  const commandActivationIds = [];

  activationEvents.forEach((eventName) => {
    if (eventName.startsWith(ACTIVATION_ON_IPC_PREFIX)) {
      ipcActivationTypes.push(eventName.slice(ACTIVATION_ON_IPC_PREFIX.length));
    }
    if (eventName.startsWith(ACTIVATION_ON_COMMAND_PREFIX)) {
      commandActivationIds.push(eventName.slice(ACTIVATION_ON_COMMAND_PREFIX.length));
    }
  });

  return {
    ipcActivationTypes: uniqueStrings(ipcActivationTypes),
    commandActivationIds: uniqueStrings(commandActivationIds),
  };
};

/**
 * 生成插件运行期状态的默认壳对象。
 *
 * 这些字段会在插件真正启用后被运行期导出覆盖。
 *
 * @returns {object} 空运行期状态对象。
 */
const createRuntimeState = () => ({
  pluginDidLoad: null,
  pluginWillUnload: null,
  pluginSettingSaved: null,
  settingMenu: [],
  pluginMenu: [],
  ipcHandlers: [],
  libs: null,
  windowOptions: {},
  commands: [],
});

/**
 * 检查插件入口文件、UI 产物和窗口页面是否存在。
 *
 * @param {object} plugin - 已初始化基础字段的插件对象。
 * @returns {Array<string>} 缺失构建产物的标签列表。
 */
const getEntryIssues = (plugin) => {
  const issues = [];
  if (plugin.exports) {
    const mainEntry = path.resolve(plugin.pluginPath, plugin.exports);
    if (!pathExists(mainEntry)) {
      issues.push('main entry');
    }
  }
  if (plugin.ui && !pathExists(plugin.ui)) {
    issues.push('ui bundle');
  }
  if (plugin.windowUrl && plugin.windowUrl.startsWith('file://')) {
    const filePath = plugin.windowUrl.replace(/^file:\/\//, '');
    if (!pathExists(filePath)) {
      issues.push('window page');
    }
  }
  return issues;
};

/**
 * 按给定状态生成一个新的插件快照。
 *
 * @param {object} plugin - 原插件对象。
 * @param {string} [status=PLUGIN_STATUS_READY] - 目标状态。
 * @param {string} [statusText=''] - 状态说明文本。
 * @returns {object} 附带最新状态字段的新对象。
 */
const applyPluginStatus = (plugin, status = PLUGIN_STATUS_READY, statusText = '') => ({
  ...plugin,
  status,
  statusText,
  lastError: status === PLUGIN_STATUS_LOAD_ERROR ? statusText : plugin.lastError || '',
  available: ![
    PLUGIN_STATUS_BLOCKED,
    PLUGIN_STATUS_BUILD_MISSING,
    PLUGIN_STATUS_LOAD_ERROR,
  ].includes(status),
});

/**
 * 把依赖缺失、阻塞和循环依赖整理为可直接展示的提示语。
 *
 * @param {object} plugin - 插件对象。
 * @returns {string} 拼接后的依赖状态描述。
 */
const getDependencyStatusText = (plugin) => {
  const parts = [];

  if (plugin.missingDependencies?.length) {
    parts.push(`缺少前置插件：${plugin.missingDependencies.join('、')}`);
  }
  if (plugin.blockedBy?.length) {
    parts.push(`被阻塞：${plugin.blockedBy.join('、')}`);
  }
  if (plugin.cycleDependencies?.length) {
    parts.push(`存在循环依赖：${plugin.cycleDependencies.join('、')}`);
  }

  return parts.join('；');
};

/**
 * 根据当前插件字段重新推导展示状态。
 *
 * 优先级依次为：
 * 1. 构建产物缺失
 * 2. 依赖阻塞
 * 3. 已激活
 * 4. 加载异常
 * 5. 就绪
 *
 * @param {object} plugin - 待更新状态的插件对象。
 * @returns {object} 带最新状态字段的新对象。
 */
const refreshPluginStatus = (plugin) => {
  if (plugin.entryIssues?.length) {
    return applyPluginStatus(
      plugin,
      PLUGIN_STATUS_BUILD_MISSING,
      `缺少${plugin.entryIssues.join('、')}，请先构建插件后再在 Translime 中加载。`,
    );
  }

  const dependencyStatusText = getDependencyStatusText(plugin);
  if (dependencyStatusText) {
    return applyPluginStatus(plugin, PLUGIN_STATUS_BLOCKED, dependencyStatusText);
  }

  if (plugin.active) {
    return applyPluginStatus(plugin, PLUGIN_STATUS_ACTIVE, '');
  }

  if (plugin.status === PLUGIN_STATUS_LOAD_ERROR && plugin.lastError) {
    return applyPluginStatus(plugin, PLUGIN_STATUS_LOAD_ERROR, plugin.lastError);
  }

  return applyPluginStatus(plugin, PLUGIN_STATUS_READY, '');
};

/**
 * 构造一个“损坏插件”占位对象。
 *
 * 当插件清单损坏、解析异常或读取失败时，扫描流程会保留这个占位对象，
 * 以便前端仍能展示错误信息，而不是直接把插件吞掉。
 *
 * @param {object} options - 占位对象构建参数。
 * @param {string} options.packageName - 插件包名。
 * @param {string} options.pluginPath - 插件目录。
 * @param {string} options.source - 插件来源。
 * @param {Error|string} options.error - 触发占位对象的异常。
 * @returns {object} 带错误状态的插件对象。
 */
const createBrokenPlugin = ({
  packageName,
  pluginPath,
  source,
  error,
}) => {
  const plugin = {
    packageName,
    title: packageName,
    description: '',
    author: '',
    link: '',
    icon: null,
    exports: null,
    pluginPath,
    version: '',
    enabled: false,
    dev: source === PLUGIN_SOURCE_DEV,
    source,
    activationEvents: [ACTIVATION_ON_STARTUP],
    dependencies: [],
    optionalDependencies: [],
    contributes: {
      commands: [],
    },
    ipcActivationTypes: [],
    commandActivationIds: [],
    missingDependencies: [],
    missingOptionalDependencies: [],
    blockedBy: [],
    cycleDependencies: [],
    dependents: [],
    dependencyOf: [],
    entryIssues: [],
    active: false,
    loadTime: 0,
    ...createRuntimeState(),
  };

  return applyPluginStatus(
    plugin,
    PLUGIN_STATUS_LOAD_ERROR,
    error instanceof Error ? error.message : String(error),
  );
};

/**
 * 从 npm 包级作者字段中提取展示用作者名。
 *
 * @param {string|{name?: string}|undefined|null} author - package.json 的 `author` 字段。
 * @returns {string} 展示用作者名。
 */
const resolvePluginAuthor = (author) => {
  if (!author) {
    return '';
  }

  if (typeof author === 'string') {
    return author;
  }

  return author.name || '';
};

/**
 * 读取插件图标并转成 data URL。
 *
 * @param {string} pluginPath - 插件目录。
 * @param {string} iconPath - 图标相对路径。
 * @returns {string|null} data URL；读取失败时返回 `null`。
 */
const resolvePluginIcon = (pluginPath, iconPath) => {
  if (!iconPath) {
    return null;
  }

  const imgPath = path.resolve(pluginPath, iconPath);

  try {
    const mimeTypes = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      bmp: 'image/bmp',
      webp: 'image/webp',
      svg: 'image/svg+xml',
    };
    const ext = path.extname(imgPath).toLowerCase().replace('.', '');
    const iconData = fs.readFileSync(imgPath, { encoding: 'base64' });

    return `data:${mimeTypes[ext]};base64, ${iconData}`;
  } catch (err) {
    return null;
  }
};

/**
 * 解析插件窗口页面地址。
 *
 * 对远程链接保持原样，对本地相对路径统一转成 `file://` 绝对地址。
 *
 * @param {string} pluginPath - 插件目录。
 * @param {string} windowUrl - 原始窗口地址。
 * @returns {string|undefined} 可直接使用的窗口地址。
 */
const resolvePluginWindowUrl = (pluginPath, windowUrl) => {
  if (!windowUrl) {
    return windowUrl;
  }

  if (/^https?:\/\//i.test(windowUrl)) {
    return windowUrl;
  }

  return `file://${path.resolve(pluginPath, windowUrl)}`;
};

/**
 * 从 package.json 中解析插件主入口。
 *
 * 优先读取 `exports['.'].require`，否则回退到 `main`。
 *
 * @param {object} pluginPkg - package.json 内容。
 * @returns {string|null} 插件主入口相对路径。
 */
const resolvePluginExports = (pluginPkg) => {
  let exportsEntry = pluginPkg.main || null;

  if (pluginPkg.exports?.['.']?.require) {
    exportsEntry = pluginPkg.exports['.'].require;
  }

  return exportsEntry;
};

/**
 * 把原始插件清单扩展成运行期统一结构。
 *
 * @param {object} plugin - 基础插件对象。
 * @param {string} pluginPath - 插件目录。
 * @param {object} pluginPkg - package.json 内容。
 * @param {string} source - 插件来源。
 * @returns {object} 初始化完成的插件对象。
 */
const initializePluginState = (plugin, pluginPath, pluginPkg, source) => {
  const initializedPlugin = {
    ...plugin,
    activationEvents: normalizeActivationEvents(plugin.activationEvents),
    dependencies: uniqueStrings(plugin.dependencies),
    optionalDependencies: uniqueStrings(plugin.optionalDependencies),
    contributes: {
      commands: normalizeCommands(plugin.contributes?.commands),
    },
    exports: resolvePluginExports(pluginPkg),
    pluginPath,
    version: pluginPkg.version,
    dev: source === PLUGIN_SOURCE_DEV,
    source,
    active: false,
    loadTime: 0,
    missingDependencies: [],
    missingOptionalDependencies: [],
    blockedBy: [],
    cycleDependencies: [],
    dependents: [],
    dependencyOf: [],
    ...createRuntimeState(),
  };

  Object.assign(initializedPlugin, parseActivationMeta(initializedPlugin.activationEvents));
  initializedPlugin.entryIssues = getEntryIssues(initializedPlugin);

  return initializedPlugin;
};

/**
 * 读取并标准化单个插件。
 *
 * 这里会同时合并 `package.json` 与 `plugin` 字段中的信息，
 * 并根据配置中心判断插件默认启用状态。
 *
 * @param {string} pluginPath - 插件目录。
 * @param {object} [options={}] - 读取选项。
 * @param {string} [options.source=PLUGIN_SOURCE_RELEASE] - 插件来源。
 * @param {Array<object>|null} [options.devPlugins=null] - 已加载的开发插件列表，用于覆盖同名正式插件。
 * @returns {object|false} 标准化后的插件对象；若被开发插件覆盖则返回 `false`。
 */
const readPlugin = (pluginPath, {
  source = PLUGIN_SOURCE_RELEASE,
  devPlugins = null,
} = {}) => {
  const pluginPkg = readPackageManifest(pluginPath);
  let plugin = {
    ...(pluginPkg.plugin || {}),
    packageName: pluginPkg.name,
    title: pluginPkg.plugin?.title || pluginPkg.name,
    author: pluginPkg.plugin?.author || resolvePluginAuthor(pluginPkg.author),
    link: pluginPkg.plugin?.link || pluginPkg.link || '',
    description: pluginPkg.plugin?.description || pluginPkg.description || '',
  };

  if (
    devPlugins
    && devPlugins.some((item) => item.packageName === plugin.packageName)
  ) {
    return false;
  }

  plugin.icon = resolvePluginIcon(pluginPath, plugin.icon);
  plugin.windowUrl = source === PLUGIN_SOURCE_DEV && plugin['windowUrl.dev']
    ? plugin['windowUrl.dev']
    : plugin.windowUrl;
  plugin.windowUrl = resolvePluginWindowUrl(pluginPath, plugin.windowUrl);

  if (plugin.ui) {
    plugin.ui = path.resolve(pluginPath, plugin.ui);
  }

  plugin = initializePluginState(plugin, pluginPath, pluginPkg, source);

  const shouldEnable = mainStore.config.get(
    `plugin.${plugin.packageName}.enabled`,
    true,
  );

  if (plugin.entryIssues.length) {
    plugin = applyPluginStatus(
      plugin,
      PLUGIN_STATUS_BUILD_MISSING,
      `缺少${plugin.entryIssues.join('、')}，请先构建插件后再在 Translime 中加载。`,
    );
    plugin.enabled = false;
  } else {
    plugin = applyPluginStatus(plugin, PLUGIN_STATUS_DISCOVERED);
    plugin.enabled = shouldEnable;
  }

  return plugin;
};

/**
 * 安全读取插件。
 *
 * 任何异常都会被转换为“损坏插件”占位对象，
 * 保证扫描流程不会被单个异常插件打断。
 *
 * @param {string} pluginPath - 插件目录。
 * @param {object} [options={}] - 读取选项。
 * @returns {object|false} 插件对象，或开发插件覆盖时的 `false`。
 */
const readPluginSafe = (pluginPath, options = {}) => {
  const fallbackName = path.basename(pluginPath);

  try {
    return readPlugin(pluginPath, options);
  } catch (error) {
    return createBrokenPlugin({
      packageName: fallbackName,
      pluginPath,
      source: options.source || PLUGIN_SOURCE_RELEASE,
      error,
    });
  }
};

export {
  ACTIVATION_ON_STARTUP,
  ACTIVATION_ON_VIEW,
  PLUGIN_STATUS_ACTIVATING,
  PLUGIN_STATUS_DISCOVERED,
  applyPluginStatus,
  createRuntimeState,
  pathExists,
  normalizeCommands,
  parseActivationMeta,
  readPluginSafe,
  refreshPluginStatus,
  uniqueStrings,
};
