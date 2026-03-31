import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import {
  app,
  clipboard,
  Menu,
  net,
} from 'electron';
import EventEmitter from 'node:events';
import Module, { createRequire } from 'node:module';
import * as tar from 'tar';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import mainStore from '../utils/useMainStore';
import appManager from '../utils/useAppManager';
import logger from '../utils/logger';
import readPackageManifest from '../utils/readPackageManifest';
import pluginInterop from './pluginInterop';

const requireFresh = createRequire(path.join(process.cwd(), 'package.json'));

const APPDATA_PATH = app.getPath('userData');
const PLUGIN_DIR = path.join(APPDATA_PATH, 'plugins');
const PLUGIN_DIR_DEV = path.join(APPDATA_PATH, 'plugins_dev');
const PLUGIN_JSON_PATH = path.join(PLUGIN_DIR, 'package.json');
const PLUGIN_MODULES_PATH = path.join(PLUGIN_DIR, 'node_modules');
const PLUGIN_MODULES_PATH_DEV = path.join(PLUGIN_DIR_DEV, 'node_modules');
const PLUGIN_PACKAGE_DIR = path.join(PLUGIN_DIR, 'package');
const TEMP_NODE_DIR = path.join(app.getPath('temp'), 'translime-node-cache');
const PLUGIN_SOURCE_RELEASE = 'release';
const PLUGIN_SOURCE_DEV = 'dev';
const PLUGIN_STATUS_DISCOVERED = 'discovered';
const PLUGIN_STATUS_READY = 'ready';
const PLUGIN_STATUS_ACTIVATING = 'activating';
const PLUGIN_STATUS_ACTIVE = 'active';
const PLUGIN_STATUS_BLOCKED = 'blocked';
const PLUGIN_STATUS_BUILD_MISSING = 'build-missing';
const PLUGIN_STATUS_LOAD_ERROR = 'load-error';
const ACTIVATION_ON_STARTUP = 'onStartup';
const ACTIVATION_ON_VIEW = 'onView';
const ACTIVATION_ON_COMMAND_PREFIX = 'onCommand:';
const ACTIVATION_ON_IPC_PREFIX = 'onIpc:';

const resolvePluginPath = (pluginName, isDevPlugin = false) => path.join(
  isDevPlugin ? PLUGIN_MODULES_PATH_DEV : PLUGIN_MODULES_PATH,
  pluginName,
);

const isPluginPackageName = (name) => /^translime-plugin-/.test(name);

const pathExists = (targetPath) => {
  try {
    fs.accessSync(targetPath);
    return true;
  } catch (err) {
    return false;
  }
};

const toArray = (value) => {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const uniqueStrings = (value) => Array.from(new Set(
  toArray(value)
    .map((item) => String(item).trim())
    .filter(Boolean),
));

const normalizeActivationEvents = (activationEvents) => {
  const normalized = uniqueStrings(activationEvents);
  if (!normalized.length) {
    return [ACTIVATION_ON_STARTUP];
  }
  return normalized;
};

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

async function readPluginPackageInfo(filePath) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(filePath);
    const unzipStream = fileStream.pipe(zlib.createGunzip()); // 使用zlib库中的createGunzip方法将压缩包解压缩
    const extractStream = unzipStream.pipe(
      tar.extract({ cwd: mainStore.TEMP_DIR }),
    ); // 使用tar库中的extract方法解压缩后提取文件

    let found = false; // 添加一个标志来记录是否找到目标文件

    extractStream.on('entry', (entry) => {
      if (entry.path === 'package/package.json') {
        // 如果找到目标文件，则读取并返回其内容
        found = true; // 找到目标文件，将标志设置为true
        let content = '';
        entry.on('data', (chunk) => {
          content += chunk.toString();
        });
        entry.on('end', () => {
          try {
            resolve(JSON.parse(content));
          } catch (err) {
            reject(new Error('无法读取插件信息'));
          }
        });
      } else {
        entry.resume(); // 跳过非目标文件
      }
    });

    extractStream.on('end', () => {
      if (!found) {
        // 如果未找到目标文件，则Promise被拒绝
        reject(new Error('无法识别这个插件包'));
      }
    });

    extractStream.on('error', (error) => {
      reject(error);
    });
  });
}

const readPlugin = (pluginPath, {
  source = PLUGIN_SOURCE_RELEASE,
  devPlugins = null,
} = {}) => {
  const pluginPkg = readPackageManifest(pluginPath);
  let plugin = {
    ...(pluginPkg.plugin || {}),
  };
  plugin.packageName = pluginPkg.name;
  if (
    devPlugins
    && devPlugins.some((p) => p.packageName === plugin.packageName)
  ) {
    // 优先加载 dev 插件
    return false;
  }
  if (!plugin.title) {
    plugin.title = pluginPkg.name;
  }
  if (!plugin.author) {
    plugin.author = pluginPkg.author ? pluginPkg.author.name : '';
  }
  if (!plugin.link) {
    plugin.link = pluginPkg.link || '';
  }
  if (!plugin.description) {
    plugin.description = pluginPkg.description || '';
  }
  if (plugin.icon) {
    const imgPath = path.resolve(pluginPath, plugin.icon);
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
      plugin.icon = `data:${mimeTypes[ext]};base64, ${iconData}`;
    } catch (err) {
      plugin.icon = null;
    }
  } else {
    plugin.icon = null;
  }
  if (source === PLUGIN_SOURCE_DEV && plugin['windowUrl.dev']) {
    plugin.windowUrl = plugin['windowUrl.dev'];
  }
  if (plugin.windowUrl) {
    plugin.windowUrl = /^https?:\/\//i.test(plugin.windowUrl)
      ? plugin.windowUrl
      : `file://${path.resolve(pluginPath, plugin.windowUrl)}`;
  }
  if (plugin.ui) {
    plugin.ui = path.resolve(pluginPath, plugin.ui);
  }
  plugin.activationEvents = normalizeActivationEvents(plugin.activationEvents);
  plugin.dependencies = uniqueStrings(plugin.dependencies);
  plugin.optionalDependencies = uniqueStrings(plugin.optionalDependencies);
  plugin.contributes = {
    commands: normalizeCommands(plugin.contributes?.commands),
  };
  Object.assign(plugin, parseActivationMeta(plugin.activationEvents));
  plugin.exports = pluginPkg.main ? pluginPkg.main : null;
  if (pluginPkg.exports) {
    if (pluginPkg.exports['.'] && pluginPkg.exports['.'].require) {
      plugin.exports = pluginPkg.exports['.'].require;
    }
  }
  plugin.pluginPath = pluginPath;
  plugin.version = pluginPkg.version;
  plugin.dev = source === PLUGIN_SOURCE_DEV;
  plugin.source = source;
  plugin.active = false;
  plugin.loadTime = 0;
  plugin.missingDependencies = [];
  plugin.missingOptionalDependencies = [];
  plugin.blockedBy = [];
  plugin.cycleDependencies = [];
  plugin.dependents = [];
  plugin.dependencyOf = [];
  plugin.entryIssues = getEntryIssues(plugin);
  Object.assign(plugin, createRuntimeState());
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

function readPluginSafe(pluginPath, options = {}) {
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
}

/**
 * 获取当前配置的 npm registry 地址
 * @returns {string} registry URL
 */
const getRegistry = () => mainStore.config.get(
  'setting.registry',
  'https://registry.npmmirror.com/',
).replace(/\/$/, '');

/**
 * 从 npm registry 获取包的元数据
 * @param {string} packageName - 包名
 * @param {string} [version] - 可选版本号，默认获取 latest
 * @returns {Promise<{version: string, tarball: string}>} 包版本和 tarball URL
 */
const fetchPackageMetadata = (packageName, version) => new Promise((resolve, reject) => {
  const registry = getRegistry();
  const url = version
    ? `${registry}/${packageName}/${version}`
    : `${registry}/${packageName}/latest`;

  logger.debug('[plugin] 获取包元数据', { url });

  const request = net.request({ method: 'GET', url });

  request.on('response', (response) => {
    if (response.statusCode === 404) {
      reject(new Error(`插件"${packageName}"不存在`));
      return;
    }
    if (response.statusCode !== 200) {
      reject(new Error(`获取包信息失败: HTTP ${response.statusCode}`));
      return;
    }

    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => {
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        resolve({
          version: data.version,
          tarball: data.dist ? data.dist.tarball : undefined,
        });
      } catch (err) {
        reject(new Error('解析包元数据失败'));
      }
    });
    response.on('error', reject);
  });

  request.on('error', reject);
  request.end();
});

/**
 * 下载 tarball 文件到指定路径
 * @param {string} tarballUrl - tarball 下载地址
 * @param {string} destPath - 目标文件路径
 * @returns {Promise<void>}
 */
const downloadTarball = (tarballUrl, destPath) => new Promise((resolve, reject) => {
  logger.debug('[plugin] 下载 tarball', { url: tarballUrl, dest: destPath });

  const request = net.request({ method: 'GET', url: tarballUrl });

  request.on('response', (response) => {
    // 处理重定向
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      const redirectUrl = Array.isArray(response.headers.location)
        ? response.headers.location[0]
        : response.headers.location;
      downloadTarball(redirectUrl, destPath).then(resolve).catch(reject);
      return;
    }

    if (response.statusCode !== 200) {
      reject(new Error(`下载失败: HTTP ${response.statusCode}`));
      return;
    }

    const writeStream = fs.createWriteStream(destPath);
    response.on('data', (chunk) => writeStream.write(chunk));
    response.on('end', () => {
      writeStream.end();
      writeStream.on('finish', resolve);
    });
    response.on('error', (err) => {
      writeStream.destroy();
      reject(err);
    });
  });

  request.on('error', reject);
  request.end();
});

/**
 * 解压 tarball 到 node_modules 目录
 * npm 包的 tarball 内容在 package/ 目录下，需要解压到 node_modules/{packageName}/
 * @param {string} tarballPath - tarball 文件路径
 * @param {string} packageName - 包名
 * @returns {Promise<void>}
 */
const extractTarball = async (tarballPath, packageName) => {
  const destDir = path.join(PLUGIN_MODULES_PATH, packageName);

  // 确保目标目录存在
  await fsp.mkdir(destDir, { recursive: true });

  logger.debug('[plugin] 解压 tarball', { src: tarballPath, dest: destDir });

  // 使用 pipeline 处理流
  await pipeline(
    fs.createReadStream(tarballPath),
    zlib.createGunzip(),
    tar.extract({
      cwd: destDir,
      strip: 1, // 去掉 tarball 中的 package/ 前缀
    }),
  );
};

/**
 * 更新 package.json 中的 dependencies
 * @param {string} packageName - 包名
 * @param {string} version - 版本号
 * @param {'add' | 'remove'} action - 操作类型
 * @returns {Promise<void>}
 */
const updatePluginDependency = async (packageName, version, action) => {
  const pkgContent = await fsp.readFile(PLUGIN_JSON_PATH, 'utf-8');
  const pkg = JSON.parse(pkgContent);

  if (!pkg.dependencies) {
    pkg.dependencies = {};
  }

  if (action === 'add') {
    pkg.dependencies[packageName] = version;
  } else if (action === 'remove') {
    delete pkg.dependencies[packageName];
  }

  await fsp.writeFile(PLUGIN_JSON_PATH, JSON.stringify(pkg, null, 2), 'utf-8');
  logger.debug('[plugin] 更新 package.json', { packageName, version, action });
};

const processPlugin = (plugin) => {
  // 运行插件加载方法
  if (typeof plugin.pluginDidLoad === 'function') {
    plugin.pluginDidLoad();
  }
};

const normalizeRuntimeCommands = (commands) => {
  if (!commands) {
    return [];
  }

  if (Array.isArray(commands)) {
    return commands
      .map((command) => {
        if (!command || !command.id || typeof command.handler !== 'function') {
          return null;
        }
        return {
          id: String(command.id),
          handler: command.handler,
        };
      })
      .filter(Boolean);
  }

  if (typeof commands === 'object') {
    return Object.entries(commands)
      .map(([id, handler]) => {
        if (typeof handler !== 'function') {
          return null;
        }
        return {
          id,
          handler,
        };
      })
      .filter(Boolean);
  }

  return [];
};

class PluginLoader extends EventEmitter {
  constructor() {
    super();
    this.plugins = [];
    this.commandRegistry = new Map();
    this.runtimeCommandHandlers = new Map();
    this.ipcActivationRegistry = new Map();
    this.activatingPlugins = new Set();
  }

  init() {
    this.cleanTempNodeFiles();
    this.setupNodeLoaderHack();
    fs.access(PLUGIN_JSON_PATH, fs.constants.F_OK, (err) => {
      if (err) {
        const pkg = {
          name: 'translime-plugins',
          description: 'translime-plugins',
          license: 'MIT',
          dependencies: {},
        };
        try {
          fs.accessSync(PLUGIN_DIR);
        } catch (aErr) {
          fs.mkdirSync(PLUGIN_DIR);
        }
        fs.writeFileSync(
          PLUGIN_JSON_PATH,
          JSON.stringify(pkg, null, 2),
          'utf8',
        );
      }
    });

    try {
      fs.accessSync(PLUGIN_PACKAGE_DIR);
    } catch (err) {
      fs.mkdirSync(PLUGIN_PACKAGE_DIR);
    }

    try {
      fs.accessSync(PLUGIN_DIR_DEV);
    } catch (dErr) {
      fs.mkdirSync(PLUGIN_DIR_DEV);
    }
  }

  getPlugins() {
    if (!this.plugins.length) {
      this.resolvePlugins();
    }
    return this.plugins;
  }

  getPlugin(name) {
    return this.plugins.find((plugin) => plugin.packageName === name);
  }

  getPluginIndex(name) {
    return this.plugins.findIndex((plugin) => plugin.packageName === name);
  }

  readPluginSafe(pluginPath, options = {}) {
    if (!Array.isArray(this.plugins)) {
      throw new TypeError('plugins 列表未初始化');
    }
    return readPluginSafe(pluginPath, options);
  }

  buildDependencyGraph() {
    const pluginMap = new Map(this.plugins.map((plugin) => [plugin.packageName, plugin]));

    this.plugins.forEach((plugin) => {
      Object.assign(plugin, {
        missingDependencies: [],
        missingOptionalDependencies: [],
        blockedBy: [],
        cycleDependencies: [],
        dependents: [],
        dependencyOf: [],
      });
    });

    this.plugins.forEach((plugin) => {
      plugin.dependencies.forEach((dependencyId) => {
        const dependency = pluginMap.get(dependencyId);
        if (!dependency) {
          plugin.missingDependencies.push(dependencyId);
          return;
        }
        plugin.dependencyOf.push(dependencyId);
        dependency.dependents.push(plugin.packageName);
      });

      plugin.optionalDependencies.forEach((dependencyId) => {
        if (!pluginMap.has(dependencyId)) {
          plugin.missingOptionalDependencies.push(dependencyId);
        }
      });
    });

    const visiting = new Set();
    const visited = new Set();
    const stack = [];

    const visit = (pluginId) => {
      if (visited.has(pluginId)) {
        return;
      }

      if (visiting.has(pluginId)) {
        const startIndex = stack.indexOf(pluginId);
        const cycleNodes = stack.slice(startIndex).concat(pluginId);
        cycleNodes.forEach((id) => {
          const cyclePlugin = pluginMap.get(id);
          if (cyclePlugin) {
            cyclePlugin.cycleDependencies = uniqueStrings(cycleNodes.filter((item) => item !== id));
          }
        });
        return;
      }

      const plugin = pluginMap.get(pluginId);
      if (!plugin) {
        return;
      }

      visiting.add(pluginId);
      stack.push(pluginId);
      plugin.dependencies.forEach((dependencyId) => {
        if (pluginMap.has(dependencyId)) {
          visit(dependencyId);
        }
      });
      stack.pop();
      visiting.delete(pluginId);
      visited.add(pluginId);
    };

    this.plugins.forEach((plugin) => {
      visit(plugin.packageName);
    });

    this.plugins.forEach((plugin) => {
      plugin.dependencies.forEach((dependencyId) => {
        const dependency = pluginMap.get(dependencyId);
        if (dependency && dependency.available === false) {
          plugin.blockedBy.push(dependencyId);
        }
      });
      Object.assign(plugin, refreshPluginStatus(plugin));
    });
  }

  rebuildActivationIndexes() {
    this.commandRegistry.clear();
    this.runtimeCommandHandlers.clear();
    this.ipcActivationRegistry.clear();

    this.plugins.forEach((plugin) => {
      plugin.contributes.commands.forEach((command) => {
        this.commandRegistry.set(command.id, {
          pluginId: plugin.packageName,
          title: command.title,
        });
      });

      plugin.ipcActivationTypes.forEach((type) => {
        this.ipcActivationRegistry.set(`${type}@${plugin.packageName}`, plugin.packageName);
      });
    });
  }

  activateStartupPlugins() {
    this.plugins.forEach((plugin) => {
      if (!plugin.enabled) {
        return;
      }
      if (plugin.activationEvents.includes(ACTIVATION_ON_STARTUP)) {
        this.enablePlugin(plugin.packageName, true);
      } else {
        Object.assign(plugin, refreshPluginStatus(plugin));
      }
    });
  }

  resolvePlugins() {
    try {
      fs.accessSync(PLUGIN_MODULES_PATH_DEV);
    } catch (dErr) {
      fs.mkdirSync(PLUGIN_MODULES_PATH_DEV);
    }
    const showDevPlugin = mainStore.config.get('setting.showDevPlugin', false);
    const json = JSON.parse(fs.readFileSync(PLUGIN_JSON_PATH, 'utf8'));
    const deps = Object.keys(json.dependencies || {});
    this.plugins = [];

    const filterFn = (isDev = false) => (name) => {
      if (!isPluginPackageName(name)) {
        return false;
      }
      const pluginPath = resolvePluginPath(name, isDev);
      return pathExists(pluginPath);
    };

    // 如果开启了开发插件选项，优先读取开发插件目录
    const devModules = showDevPlugin
      ? fs.readdirSync(PLUGIN_MODULES_PATH_DEV)
        .filter(filterFn(true))
        .map((pluginName) => readPluginSafe(resolvePluginPath(pluginName, true), {
          source: PLUGIN_SOURCE_DEV,
        }))
      : [];

    // 读取普通插件，如果同名的开发插件已存在（无论是否启用），则跳过普通插件
    const modules = deps
      .filter(filterFn())
      .map((pluginName) => readPluginSafe(resolvePluginPath(pluginName), {
        source: PLUGIN_SOURCE_RELEASE,
        devPlugins: devModules,
      }))
      .filter((plugin) => plugin);

    this.plugins = [...modules, ...devModules];
    this.buildDependencyGraph();
    this.rebuildActivationIndexes();
    this.activateStartupPlugins();
    this.emit('init', this.plugins);
    return this.plugins;
  }

  readPlugins() {
    return this.resolvePlugins();
  }

  triggerActivation(eventName) {
    const targets = this.plugins.filter((plugin) => (
      plugin.enabled && plugin.activationEvents.includes(eventName)
    ));
    targets.forEach((plugin) => {
      this.enablePlugin(plugin.packageName, true);
    });
    return targets;
  }

  triggerViewActivation(packageName) {
    const plugin = this.getPlugin(packageName);
    if (!plugin) {
      throw new Error(`插件 "${packageName}" 不存在`);
    }
    if (
      plugin.activationEvents.includes(ACTIVATION_ON_VIEW)
      || !plugin.active
    ) {
      return this.enablePlugin(packageName);
    }
    return plugin;
  }

  executeCommand(commandId, ...args) {
    const commandMeta = this.commandRegistry.get(commandId);
    if (!commandMeta) {
      throw new Error(`命令 "${commandId}" 未注册`);
    }
    this.enablePlugin(commandMeta.pluginId);
    const runtimeCommand = this.runtimeCommandHandlers.get(commandId);
    if (!runtimeCommand) {
      throw new Error(`命令 "${commandId}" 没有可执行的处理函数`);
    }
    return runtimeCommand.handler(...args);
  }

  ensurePluginIpcReady(channelType) {
    const pluginId = this.ipcActivationRegistry.get(channelType);
    if (!pluginId) {
      return false;
    }
    this.enablePlugin(pluginId);
    return true;
  }

  getDependents(packageName) {
    return this.plugins.filter((plugin) => plugin.dependencies.includes(packageName));
  }

  enablePlugins(plugins) {
    this.plugins = plugins.map((plugin) => refreshPluginStatus({
      activationEvents: [ACTIVATION_ON_STARTUP],
      dependencies: [],
      optionalDependencies: [],
      contributes: { commands: [] },
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
      status: PLUGIN_STATUS_DISCOVERED,
      statusText: '',
      lastError: '',
      loadTime: 0,
      ...createRuntimeState(),
      ...plugin,
    }));
    this.rebuildActivationIndexes();
    this.activateStartupPlugins();
    this.emit('init', this.plugins);
  }

  enablePlugin(packageName, init = false) {
    let plugin = this.getPlugin(packageName);
    if (!plugin) {
      const pluginPath = resolvePluginPath(packageName);
      plugin = readPluginSafe(pluginPath, {
        source: PLUGIN_SOURCE_RELEASE,
        devPlugins: this.getPlugins().filter((p) => p.dev),
      });
      logger.debug('[plugin] reload plugin: ', { plugin });
      if (plugin) {
        this.plugins.push(plugin);
        this.buildDependencyGraph();
        this.rebuildActivationIndexes();
      }
    }
    Object.assign(plugin, {
      dependencies: plugin.dependencies || [],
      optionalDependencies: plugin.optionalDependencies || [],
      contributes: plugin.contributes || { commands: [] },
      blockedBy: plugin.blockedBy || [],
      missingDependencies: plugin.missingDependencies || [],
      commands: plugin.commands || [],
    });
    if (plugin.active || this.activatingPlugins.has(packageName)) {
      return plugin;
    }
    Object.assign(plugin, refreshPluginStatus(plugin));
    if (plugin.available === false) {
      this.emit('plugin:error', {
        plugin,
        pluginId: packageName,
        error: new Error(plugin.statusText),
        operation: 'enable',
      });
      return plugin;
    }
    const disabledDependencies = plugin.dependencies.filter((dependencyId) => {
      const dependency = this.getPlugin(dependencyId);
      if (!dependency) {
        return true;
      }
      return !dependency.enabled;
    });
    if (disabledDependencies.length) {
      plugin.missingDependencies = uniqueStrings([
        ...plugin.missingDependencies,
        ...disabledDependencies,
      ]);
      Object.assign(plugin, refreshPluginStatus(plugin), {
        enabled: false,
      });
      this.emit('plugin:error', {
        plugin,
        pluginId: packageName,
        error: new Error(plugin.statusText),
        operation: 'enable',
      });
      return plugin;
    }
    this.activatingPlugins.add(packageName);
    Object.assign(plugin, applyPluginStatus(plugin, PLUGIN_STATUS_ACTIVATING));
    plugin.dependencies.forEach((dependencyId) => {
      this.enablePlugin(dependencyId, true);
    });
    let pluginMain = {};
    if (plugin.exports) {
      try {
        const pluginExports = path.join(plugin.pluginPath, plugin.exports);
        const pluginImport = requireFresh(`${pluginExports}`);
        pluginMain = {
          pluginDidLoad: pluginImport.pluginDidLoad,
          pluginWillUnload: pluginImport.pluginWillUnload,
          pluginSettingSaved: pluginImport.pluginSettingSaved,
          settingMenu: pluginImport.settingMenu,
          pluginMenu: pluginImport.pluginMenu,
          ipcHandlers: pluginImport.ipcHandlers,
          libs: pluginImport.libs,
          windowOptions: pluginImport.windowOptions,
          commands: normalizeRuntimeCommands(pluginImport.commands),
        };
      } catch (err) {
        logger.error('[plugin] enable error: ', err);
        Object.assign(
          plugin,
          applyPluginStatus(plugin, PLUGIN_STATUS_LOAD_ERROR, err.message),
          { enabled: false },
        );
        this.activatingPlugins.delete(packageName);
        this.emit('plugin:error', {
          plugin: plugin || null,
          pluginId: packageName,
          error: err,
          operation: 'enable',
        });
        return plugin;
      }
    }
    Object.assign(plugin, createRuntimeState(), refreshPluginStatus(plugin));
    pluginMain.enabled = true;
    pluginMain.active = true;
    pluginMain.loadTime = Date.now();
    mainStore.config.set(`plugin.${plugin.packageName}.enabled`, true);
    const mergedPlugin = Object.assign(plugin, pluginMain || {});
    if (mergedPlugin.ipcHandlers && mergedPlugin.ipcHandlers.length) {
      mergedPlugin.ipcHandlers.forEach((handler) => {
        const ipc = appManager.getIpc();
        if (ipc) {
          ipc.appendHandler(
            `${handler.type}@${mergedPlugin.packageName}`,
            handler.handler,
          );
        }
      });
    }
    if (mergedPlugin.commands?.length) {
      mergedPlugin.commands.forEach((command) => {
        this.runtimeCommandHandlers.set(command.id, {
          pluginId: mergedPlugin.packageName,
          handler: command.handler,
        });
      });
    }
    if (mergedPlugin.libs) {
      pluginInterop.register(mergedPlugin.packageName, mergedPlugin.libs);
    }
    mergedPlugin.windowOptions = {};
    if (mergedPlugin.windowUrl) {
      mergedPlugin.windowMode = true;
      mergedPlugin.windowOptions = pluginMain.windowOptions || {};
    } else if (typeof mergedPlugin.windowMode === 'undefined') {
      mergedPlugin.windowMode = mainStore.config.get(
        `plugin.${plugin.packageName}.windowMode`,
        false,
      );
    }
    processPlugin(mergedPlugin);
    Object.assign(mergedPlugin, refreshPluginStatus(mergedPlugin));
    this.activatingPlugins.delete(packageName);

    this.emit('plugin:enabled', {
      plugin: mergedPlugin,
      pluginId: mergedPlugin.packageName,
      isInit: init,
    });

    return mergedPlugin;
  }

  disablePlugin(packageName, options = {}) {
    const normalizedOptions = typeof options === 'boolean'
      ? { isUninstall: options }
      : options;
    const {
      isUninstall = false,
      keepDisabledRecord = !isUninstall,
      persistState = !isUninstall,
    } = normalizedOptions;
    const plugin = this.getPlugin(packageName);
    if (!plugin) {
      logger.warn(`[plugin] disable skipped, plugin not found: ${packageName}`);
      return false;
    }
    Object.assign(plugin, {
      enabled: false,
      active: false,
    });
    // 移除 ipc
    if (plugin.ipcHandlers && plugin.ipcHandlers.length) {
      plugin.ipcHandlers.forEach((handler) => {
        const ipc = appManager.getIpc();
        if (ipc) {
          ipc.removeHandler(`${handler.type}@${plugin.packageName}`);
        }
      });
    }
    // 注销插件跨组件通信注册表
    pluginInterop.unregister(plugin.packageName);
    if (plugin.commands?.length) {
      plugin.commands.forEach((command) => {
        this.runtimeCommandHandlers.delete(command.id);
      });
    }
    // 调用插件卸载方法
    if (typeof plugin.pluginWillUnload === 'function') {
      plugin.pluginWillUnload();
    }
    // 关闭插件窗口
    if (appManager.getChildWin(`plugin-window-${packageName}`)) {
      appManager.getChildWin(`plugin-window-${packageName}`).close();
    }
    // 删除 require 缓存
    const cacheKeys = Object.keys(requireFresh.cache);
    const packagePattern = `${path.sep}${plugin.packageName}${path.sep}`.toLowerCase();
    const normalizedPluginPath = plugin.pluginPath.toLowerCase();

    let deletedCount = 0;
    cacheKeys.forEach((key) => {
      const lowerKey = key.toLowerCase();
      // 检查路径是否包含包名目录或位于插件根目录下
      if (
        lowerKey.includes(packagePattern)
        || lowerKey.startsWith(normalizedPluginPath)
      ) {
        delete requireFresh.cache[key];
        deletedCount += 1;
      }
    });

    if (deletedCount > 0) {
      logger.debug(
        `[plugin] 已清理插件 "${plugin.packageName}" 的 ${deletedCount} 个缓存项`,
      );
    } else {
      logger.debug(`[plugin] 未找到插件 "${plugin.packageName}" 的相关缓存`, {
        target: packagePattern,
      });
    }
    const isDev = plugin.dev;
    const preservedBlockedBy = [...plugin.blockedBy];
    const preservedMissingDependencies = [...plugin.missingDependencies];
    if (keepDisabledRecord && !isUninstall) {
      const p = readPluginSafe(plugin.pluginPath, {
        source: isDev ? PLUGIN_SOURCE_DEV : PLUGIN_SOURCE_RELEASE,
        devPlugins: isDev ? null : this.getPlugins().filter((item) => item.dev),
      });
      p.enabled = false;
      p.dev = isDev; // 保留原始的 dev 标志
      Object.assign(plugin, p);
      plugin.blockedBy = uniqueStrings([...plugin.blockedBy, ...preservedBlockedBy]);
      plugin.missingDependencies = uniqueStrings([
        ...plugin.missingDependencies,
        ...preservedMissingDependencies,
      ]);
      if (persistState) {
        mainStore.config.set(`plugin.${plugin.packageName}.enabled`, false);
      }
    }
    this.getDependents(packageName).forEach((dependent) => {
      if (dependent.enabled) {
        const blockedBy = uniqueStrings([...dependent.blockedBy, packageName]);
        Object.assign(dependent, { blockedBy });
        this.disablePlugin(dependent.packageName, {
          keepDisabledRecord: true,
          persistState: true,
        });
        Object.assign(dependent, refreshPluginStatus(dependent));
      }
    });
    Object.assign(plugin, refreshPluginStatus(plugin));

    this.emit('plugin:disabled', {
      plugin,
      pluginId: packageName,
      isUninstall,
    });
    return true;
  }

  restartPlugin(packageName) {
    const plugin = this.getPlugin(packageName);
    if (!plugin) {
      throw new Error(`插件 "${packageName}" 不存在`);
    }
    this.disablePlugin(packageName, {
      keepDisabledRecord: false,
      persistState: false,
    });
    return this.enablePlugin(packageName);
  }

  refreshDevPlugins() {
    const previousPlugins = [...this.plugins];
    previousPlugins.forEach((plugin) => {
      if (plugin.enabled) {
        this.disablePlugin(plugin.packageName, {
          keepDisabledRecord: false,
          persistState: false,
        });
      }
    });
    this.plugins = [];
    return this.resolvePlugins();
  }

  /**
   * 执行本地 tarball 安装
   * @param {string} packageName - 包名
   * @param {string} tarballPath - tarball 文件路径
   * @param {string} version - 版本号
   * @returns {Promise<object>} 安装结果
   */
  async doInstallFromTarball(packageName, tarballPath, version) {
    try {
      // 解压 tarball 到 node_modules
      await extractTarball(tarballPath, packageName);

      // 更新 package.json
      await updatePluginDependency(packageName, version, 'add');

      this.resolvePlugins();
      let plugin = this.getPlugin(packageName);
      if (!plugin) {
        plugin = this.enablePlugin(packageName);
      }
      if (plugin) {
        plugin.enabled = true;
        mainStore.config.set(`plugin.${packageName}.enabled`, true);
        this.enablePlugin(packageName);
      }
      this.emit('plugin:installed', { plugin, pluginId: packageName });

      logger.info(`[plugin] 安装插件 ${packageName}@${version} 成功`);
      return {
        success: true,
        version,
        warnings: plugin?.missingDependencies?.length
          ? [`缺少前置插件：${plugin.missingDependencies.join('、')}`]
          : [],
      };
    } catch (err) {
      logger.error(`[plugin] 安装插件 ${packageName} 失败`, { error: err.message });
      this.emit('plugin:error', {
        plugin: null,
        pluginId: packageName,
        error: err,
        operation: 'install',
      });
      throw err;
    }
  }

  /**
   * 从 npm registry 安装插件
   * @param {string} packageName - 包名
   * @param {string} [version] - 可选版本号
   * @returns {Promise<object>} 安装结果
   */
  async installPlugin(packageName, version) {
    if (!/^translime-plugin-/.test(packageName)) {
      return Promise.reject(new Error('该包不是这个软件的插件'));
    }

    // 如果已存在相同插件，先卸载
    const prevPlugin = this.getPlugin(packageName);
    if (prevPlugin) {
      try {
        await this.uninstallPlugin(packageName);
      } catch (err) {
        return Promise.reject(err);
      }
    }

    try {
      // 获取包元数据
      const metadata = await fetchPackageMetadata(packageName, version);
      if (!metadata.tarball) {
        throw new Error('无法获取插件下载地址');
      }

      // 下载 tarball
      const safeName = packageName.replace(/\//g, '-');
      const tarballFileName = `${safeName}-${metadata.version}.tgz`;
      const tarballPath = path.join(PLUGIN_PACKAGE_DIR, tarballFileName);
      await downloadTarball(metadata.tarball, tarballPath);

      // 安装
      return this.doInstallFromTarball(packageName, tarballPath, metadata.version);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * 从本地 tarball 文件安装插件
   * @param {string} file - 本地 tarball 文件路径
   * @returns {Promise<object>} 安装结果
   */
  async installLocalPlugin(file) {
    // 复制 tarball 到 package 目录
    const fileParsed = path.parse(file);
    const pluginPackagePath = path.join(PLUGIN_PACKAGE_DIR, fileParsed.base);
    try {
      await fsp.copyFile(file, pluginPackagePath);
    } catch (err) {
      return Promise.reject(err);
    }

    // 读取包信息
    const pluginPackageInfo = await readPluginPackageInfo(pluginPackagePath);

    const packageName = pluginPackageInfo.name;
    if (!/^translime-plugin-/.test(packageName)) {
      return Promise.reject(new Error('该包不是这个软件的插件'));
    }

    // 如果已存在相同插件，先卸载
    const prevPlugin = this.getPlugin(packageName);
    if (prevPlugin) {
      try {
        await this.uninstallPlugin(packageName);
      } catch (err) {
        return Promise.reject(err);
      }
    }

    // 安装
    return this.doInstallFromTarball(
      packageName,
      pluginPackagePath,
      pluginPackageInfo.version,
    );
  }

  /**
   * 卸载插件
   * @param {string} packageName - 包名
   * @returns {Promise<void>}
   */
  async uninstallPlugin(packageName) {
    this.disablePlugin(packageName, true);

    try {
      const pluginDir = path.join(PLUGIN_MODULES_PATH, packageName);

      // 删除插件目录
      await fsp.rm(pluginDir, { recursive: true, force: true });

      // 更新 package.json
      await updatePluginDependency(packageName, null, 'remove');
      this.resolvePlugins();

      this.emit('plugin:uninstalled', { plugin: null, pluginId: packageName });
      logger.info(`[plugin] 卸载插件 ${packageName} 成功`);
    } catch (err) {
      logger.error(`[plugin] 卸载插件 ${packageName} 失败`, { error: err.message });
      this.emit('plugin:error', {
        plugin: null,
        pluginId: packageName,
        error: err,
        operation: 'uninstall',
      });
      throw err;
    }
  }

  popPluginMenu(packageName, ipcEv) {
    const plugin = this.getPlugin(packageName);
    const self = this;

    // 注册菜单
    const contextMenuItems = [
      {
        id: 'disable-plugin',
        label: '禁用插件',
        visible: plugin.enabled,
        click() {
          self.disablePlugin(packageName);
          ipcEv.sendToMain(ipcType.PLUGINS_CHANGED);
        },
      },
      {
        id: 'enable-plugin',
        label: '启用插件',
        visible: !plugin.enabled,
        click() {
          self.enablePlugin(packageName);
          ipcEv.sendToMain(ipcType.PLUGINS_CHANGED);
        },
      },
      {
        id: 'restart-plugin',
        label: '重启插件',
        visible: plugin.enabled,
        click() {
          self.restartPlugin(packageName);
          ipcEv.sendToMain(ipcType.PLUGINS_CHANGED);
        },
      },
      {
        id: 'uninstall-plugin',
        label: '卸载插件',
        click() {
          self.uninstallPlugin(packageName).then(() => {
            ipcEv.sendToMain(ipcType.PLUGINS_CHANGED);
          });
        },
      },
      {
        id: 'open-plugin-setting-panel',
        label: '设置',
        visible:
          plugin.enabled && !!plugin.settingMenu && !!plugin.settingMenu.length,
        click() {
          const mainWin = appManager.getWin();
          if (mainWin) {
            if (mainWin.isMinimized()) {
              mainWin.restore();
            }
            mainWin.focus();
          }
          ipcEv.sendToMain(ipcType.OPEN_PLUGIN_SETTING_PANEL, {
            packageName,
          });
        },
      },
      {
        id: 'switch-plugin-window-mode',
        label: '新窗口打开插件',
        type: 'checkbox',
        checked: plugin.windowMode,
        visible: !!plugin.ui && !plugin.windowUrl,
        click() {
          plugin.windowMode = !plugin.windowMode;
          mainStore.config.set(
            `plugin.${packageName}.windowMode`,
            plugin.windowMode,
          );
          if (
            !plugin.windowMode
            && appManager.getChildWin(`plugin-window-${packageName}`)
          ) {
            appManager.getChildWin(`plugin-window-${packageName}`).close();
          }
          ipcEv.sendToMain(ipcType.PLUGINS_CHANGED);
        },
      },
      {
        id: 'copy-plugin-link',
        label: '复制分享链接',
        click() {
          clipboard.writeText(
            `https://slime7.github.io/translime/open/?install=${packageName}`,
          );
          ipcEv.sendToMain(ipcType.IPC_TOAST, ['链接已复制']);
        },
      },
    ];
    const menuDivider = {
      type: 'separator',
    };
    if (Array.isArray(plugin.pluginMenu) && plugin.pluginMenu.length) {
      contextMenuItems.push(menuDivider, ...plugin.pluginMenu);
    }

    const menu = Menu.buildFromTemplate(contextMenuItems);
    menu.popup();
  }

  appClose() {
    this.plugins.forEach((plugin) => {
      if (plugin.enabled) {
        this.disablePlugin(plugin.packageName, {
          keepDisabledRecord: false,
          persistState: false,
        });
      }
    });
  }

  access(pluginId) {
    const plugin = this.getPlugin(pluginId);
    return plugin && plugin.active ? plugin.libs : undefined;
  }

  onPluginSettingSave(pluginId) {
    const plugin = this.getPlugin(pluginId);
    if (plugin && plugin.active && typeof plugin.pluginSettingSaved === 'function') {
      plugin.pluginSettingSaved();
    }
    this.emit('plugin:setting-changed', { plugin: plugin || null, pluginId });
  }

  /* eslint-disable class-methods-use-this, no-underscore-dangle */
  setupNodeLoaderHack() {
    const originalLoader = Module._extensions['.node'];
    Module._extensions['.node'] = (module, filename) => {
      // 仅针对插件目录下的 .node 文件进行处理
      const lowerFilename = filename.toLowerCase();
      if (
        lowerFilename.startsWith(PLUGIN_DIR.toLowerCase())
        || lowerFilename.startsWith(PLUGIN_DIR_DEV.toLowerCase())
      ) {
        try {
          // 生成唯一临时文件名，防止冲突
          const tempFileName = `${path.basename(filename, '.node')}.${Date.now()}.`
            + `${Math.random().toString(36).slice(2)}.node`;
          const tempPath = path.join(TEMP_NODE_DIR, tempFileName);

          if (!fs.existsSync(TEMP_NODE_DIR)) {
            fs.mkdirSync(TEMP_NODE_DIR, { recursive: true });
          }

          fs.copyFileSync(filename, tempPath);
          logger.debug(`[plugin] Shadow loaded .node module: ${filename} -> ${tempPath}`);
          return originalLoader(module, tempPath);
        } catch (e) {
          logger.warn(`[plugin] Failed to shadow load .node module: ${filename}`, e);
        }
      }
      return originalLoader(module, filename);
    };
  }

  cleanTempNodeFiles() {
    try {
      if (fs.existsSync(TEMP_NODE_DIR)) {
        // 尝试清理旧文件
        const files = fs.readdirSync(TEMP_NODE_DIR);
        files.forEach((file) => {
          try {
            fs.rmSync(path.join(TEMP_NODE_DIR, file), { force: true });
          } catch (e) {
            // ignore
          }
        });
      }
    } catch (e) {
      // ignore
    }
  }
}

const pluginLoader = new PluginLoader();
pluginLoader.init();
export default pluginLoader;
