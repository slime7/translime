import path from 'node:path';
import { app } from 'electron';

/**
 * 插件加载体系共享的路径、状态与激活常量。
 *
 * 这些值会被 `pluginLoader` 主入口和各个职责模块复用，
 * 用来保证扫描、加载、安装和 IPC 激活流程使用同一套约定。
 */
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

/**
 * 根据插件包名解析插件安装目录。
 *
 * 发布版插件与开发版插件会落在不同的 `node_modules` 目录下，
 * 调用方只需要通过 `isDevPlugin` 指定来源即可。
 *
 * @param {string} pluginName - 插件包名。
 * @param {boolean} [isDevPlugin=false] - 是否解析到开发插件目录。
 * @returns {string} 插件目录的绝对路径。
 */
const resolvePluginPath = (pluginName, isDevPlugin = false) => path.join(
  isDevPlugin ? PLUGIN_MODULES_PATH_DEV : PLUGIN_MODULES_PATH,
  pluginName,
);

/**
 * 判断包名是否符合 Translime 插件命名约定。
 *
 * @param {string} name - 待校验的包名。
 * @returns {boolean} 是否是受支持的插件包名。
 */
const isPluginPackageName = (name) => /^translime-plugin-/.test(name);

export {
  ACTIVATION_ON_COMMAND_PREFIX,
  ACTIVATION_ON_IPC_PREFIX,
  ACTIVATION_ON_STARTUP,
  ACTIVATION_ON_VIEW,
  PLUGIN_DIR,
  PLUGIN_DIR_DEV,
  PLUGIN_JSON_PATH,
  PLUGIN_MODULES_PATH,
  PLUGIN_MODULES_PATH_DEV,
  PLUGIN_PACKAGE_DIR,
  PLUGIN_SOURCE_DEV,
  PLUGIN_SOURCE_RELEASE,
  PLUGIN_STATUS_ACTIVE,
  PLUGIN_STATUS_ACTIVATING,
  PLUGIN_STATUS_BLOCKED,
  PLUGIN_STATUS_BUILD_MISSING,
  PLUGIN_STATUS_DISCOVERED,
  PLUGIN_STATUS_LOAD_ERROR,
  PLUGIN_STATUS_READY,
  TEMP_NODE_DIR,
  isPluginPackageName,
  resolvePluginPath,
};
