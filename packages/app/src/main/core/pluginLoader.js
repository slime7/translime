import EventEmitter from 'node:events';
import {
  PLUGIN_PACKAGE_DIR,
} from './plugin-loader/constants';
import {
  readPluginSafe,
} from './plugin-loader/metadata';
import {
  activateStartupPlugins,
  buildDependencyGraph,
  enablePlugins,
  initPluginLoader,
  rebuildActivationIndexes,
  resolvePlugins,
} from './plugin-loader/discovery';
import {
  access,
  appClose,
  disablePlugin,
  enablePlugin,
  ensurePluginIpcReady,
  executeCommand,
  getDependents,
  onPluginSettingSave,
  restartPlugin,
  triggerActivation,
  triggerViewActivation,
} from './plugin-loader/runtime';
import {
  doInstallFromTarball,
  installLocalPlugin,
  installPlugin,
  refreshDevPlugins,
  uninstallPlugin,
} from './plugin-loader/installer';
import popPluginMenu from './plugin-loader/menu';
import {
  cleanTempNodeFiles,
  setupNodeLoaderHack,
} from './plugin-loader/nativeLoader';

/**
 * 插件系统的主入口。
 *
 * 这个类主要承担两类职责：
 * 1. 维护插件相关的共享状态和运行时索引。
 * 2. 对外暴露稳定 API，并把具体实现委托给 `plugin-loader/` 下的职责模块。
 *
 * 这样做可以在不改变外部调用方式的前提下，持续拆分大文件内部实现。
 */
class PluginLoader extends EventEmitter {
  /**
   * 创建插件加载器实例并初始化内存态索引。
   */
  constructor() {
    super();
    this.plugins = [];
    this.commandRegistry = new Map();
    this.runtimeCommandHandlers = new Map();
    this.ipcActivationRegistry = new Map();
    this.activatingPlugins = new Set();
    this.pluginPackageDir = PLUGIN_PACKAGE_DIR;
  }

  /**
   * 初始化插件目录、缓存目录以及原生模块加载补丁。
   *
   * @returns {void}
   */
  init() {
    initPluginLoader(this);
  }

  /**
   * 获取插件列表；当缓存为空时会自动触发一次扫描。
   *
   * @returns {Array<object>} 当前插件列表。
   */
  getPlugins() {
    if (!this.plugins.length) {
      this.resolvePlugins();
    }
    return this.plugins;
  }

  /**
   * 按包名获取单个插件对象。
   *
   * @param {string} name - 插件包名。
   * @returns {object|undefined} 匹配到的插件对象。
   */
  getPlugin(name) {
    return this.plugins.find((plugin) => plugin.packageName === name);
  }

  /**
   * 获取插件在内部数组中的索引。
   *
   * @param {string} name - 插件包名。
   * @returns {number} 匹配索引，未找到时返回 `-1`。
   */
  getPluginIndex(name) {
    return this.plugins.findIndex((plugin) => plugin.packageName === name);
  }

  /**
   * 安全读取单个插件元数据。
   *
   * 该方法会把读取异常转换为“损坏插件”对象，避免整个扫描流程被单个异常插件中断。
   *
   * @param {string} pluginPath - 插件目录路径。
   * @param {object} [options={}] - 读取选项。
   * @returns {object|false} 插件对象；若被同名开发插件覆盖则返回 `false`。
   */
  readPluginSafe(pluginPath, options = {}) {
    if (!Array.isArray(this.plugins)) {
      throw new TypeError('plugins 列表未初始化');
    }
    return readPluginSafe(pluginPath, options);
  }

  /**
   * 重新计算依赖图、循环依赖和阻塞状态。
   *
   * @returns {void}
   */
  buildDependencyGraph() {
    buildDependencyGraph(this);
  }

  /**
   * 重建命令索引和 IPC 激活索引。
   *
   * @returns {void}
   */
  rebuildActivationIndexes() {
    rebuildActivationIndexes(this);
  }

  /**
   * 激活所有声明为启动即加载的插件。
   *
   * @returns {void}
   */
  activateStartupPlugins() {
    activateStartupPlugins(this);
  }

  /**
   * 扫描插件目录并刷新插件列表。
   *
   * @returns {Array<object>} 扫描后的插件列表。
   */
  resolvePlugins() {
    return resolvePlugins(this);
  }

  /**
   * `resolvePlugins()` 的历史兼容别名。
   *
   * @returns {Array<object>}
   */
  readPlugins() {
    return this.resolvePlugins();
  }

  /**
   * 触发指定激活事件，加载匹配该事件的插件。
   *
   * @param {string} eventName - 激活事件名。
   * @returns {Array<object>} 被触发的插件列表。
   */
  triggerActivation(eventName) {
    return triggerActivation(this, eventName);
  }

  /**
   * 触发某个插件的视图激活流程。
   *
   * @param {string} packageName - 插件包名。
   * @returns {object} 激活后的插件对象。
   */
  triggerViewActivation(packageName) {
    return triggerViewActivation(this, packageName);
  }

  /**
   * 执行插件命令。
   *
   * @param {string} commandId - 命令 ID。
   * @param {...any} args - 命令参数。
   * @returns {any} 命令处理函数的返回值。
   */
  executeCommand(commandId, ...args) {
    return executeCommand(this, commandId, ...args);
  }

  /**
   * 根据 IPC 激活索引确保目标插件已经处于可处理状态。
   *
   * @param {string} channelType - IPC 通道类型。
   * @returns {boolean} 是否找到了对应的懒激活插件。
   */
  ensurePluginIpcReady(channelType) {
    return ensurePluginIpcReady(this, channelType);
  }

  /**
   * 获取依赖指定插件的所有插件。
   *
   * @param {string} packageName - 目标插件包名。
   * @returns {Array<object>}
   */
  getDependents(packageName) {
    return getDependents(this, packageName);
  }

  /**
   * 用传入的插件列表替换当前状态并刷新索引。
   *
   * 该入口主要服务于测试和受控初始化场景。
   *
   * @param {Array<object>} plugins - 要挂载的插件列表。
   * @returns {void}
   */
  enablePlugins(plugins) {
    enablePlugins(this, plugins);
  }

  /**
   * 启用指定插件。
   *
   * @param {string} packageName - 插件包名。
   * @param {boolean} [init=false] - 是否属于初始化阶段激活。
   * @returns {object} 启用后的插件对象。
   */
  enablePlugin(packageName, init = false) {
    return enablePlugin(this, packageName, init);
  }

  /**
   * 禁用指定插件。
   *
   * @param {string} packageName - 插件包名。
   * @param {object|boolean} [options={}] - 禁用选项，兼容旧布尔参数形式。
   * @returns {boolean} 是否成功禁用。
   */
  disablePlugin(packageName, options = {}) {
    return disablePlugin(this, packageName, options);
  }

  /**
   * 重启指定插件。
   *
   * @param {string} packageName - 插件包名。
   * @returns {object} 重启后的插件对象。
   */
  restartPlugin(packageName) {
    return restartPlugin(this, packageName);
  }

  /**
   * 重新扫描开发插件目录。
   *
   * @returns {Array<object>} 刷新后的插件列表。
   */
  refreshDevPlugins() {
    return refreshDevPlugins(this);
  }

  /**
   * 执行基于 tarball 的安装流程。
   *
   * @param {string} packageName - 插件包名。
   * @param {string} tarballPath - tarball 文件路径。
   * @param {string} version - 版本号。
   * @returns {Promise<object>} 安装结果。
   */
  async doInstallFromTarball(packageName, tarballPath, version) {
    return doInstallFromTarball(this, packageName, tarballPath, version);
  }

  /**
   * 从 npm registry 安装插件。
   *
   * @param {string} packageName - 插件包名。
   * @param {string} [version] - 可选版本。
   * @returns {Promise<object>} 安装结果。
   */
  async installPlugin(packageName, version) {
    return installPlugin(this, packageName, version);
  }

  /**
   * 从本地 tarball 安装插件。
   *
   * @param {string} file - 本地 tarball 路径。
   * @returns {Promise<object>} 安装结果。
   */
  async installLocalPlugin(file) {
    return installLocalPlugin(this, file);
  }

  /**
   * 卸载指定插件。
   *
   * @param {string} packageName - 插件包名。
   * @returns {Promise<void>}
   */
  async uninstallPlugin(packageName) {
    return uninstallPlugin(this, packageName);
  }

  /**
   * 弹出插件上下文菜单。
   *
   * @param {string} packageName - 插件包名。
   * @param {object} ipcEv - IPC 事件包装对象。
   * @returns {void}
   */
  popPluginMenu(packageName, ipcEv) {
    popPluginMenu(this, packageName, ipcEv);
  }

  /**
   * 应用退出前统一关闭所有已启用插件。
   *
   * @returns {void}
   */
  appClose() {
    appClose(this);
  }

  /**
   * 获取已激活插件暴露出的跨插件访问对象。
   *
   * @param {string} pluginId - 插件包名。
   * @returns {object|undefined}
   */
  access(pluginId) {
    return access(this, pluginId);
  }

  /**
   * 通知插件其设置已被保存。
   *
   * @param {string} pluginId - 插件包名。
   * @returns {void}
   */
  onPluginSettingSave(pluginId) {
    onPluginSettingSave(this, pluginId);
  }

  /* eslint-disable class-methods-use-this */
  /**
   * 注册 `.node` 原生模块的影子加载逻辑。
   *
   * @returns {void}
   */
  setupNodeLoaderHack() {
    setupNodeLoaderHack();
  }

  /**
   * 清理影子加载产生的临时原生模块文件。
   *
   * @returns {void}
   */
  cleanTempNodeFiles() {
    cleanTempNodeFiles();
  }
}

/**
 * 插件加载器单例。
 *
 * 整个主进程范围内只保留这一份实例，以保证插件状态、事件和索引表唯一。
 */
const pluginLoader = new PluginLoader();
pluginLoader.init();

export default pluginLoader;
