import path from 'node:path';
import { createRequire } from 'node:module';
import mainStore from '../../utils/useMainStore';
import appManager from '../../utils/useAppManager';
import logger from '../../utils/logger';
import pluginInterop from '../pluginInterop';
import titleBarRegistry from '../titleBarRegistry';
import {
  ACTIVATION_ON_VIEW,
  PLUGIN_SOURCE_DEV,
  PLUGIN_SOURCE_RELEASE,
  PLUGIN_STATUS_ACTIVATING,
  PLUGIN_STATUS_LOAD_ERROR,
  resolvePluginPath,
} from './constants';
import {
  applyPluginStatus,
  createRuntimeState,
  readPluginSafe,
  refreshPluginStatus,
  uniqueStrings,
} from './metadata';
import { activateIsolatedPlugin, deactivateIsolatedPlugin, notifySettingSaved } from './isolatedRuntime';

/**
 * 插件运行期启停、命令执行与跨插件访问逻辑。
 *
 * 这一层会真正触发插件入口代码执行，并维护运行期注册表。
 */
const requireFresh = createRequire(path.join(process.cwd(), 'package.json'));

/**
 * 激活耗时超过该值（毫秒）时输出慢激活告警。
 */
const SLOW_ACTIVATION_THRESHOLD = 3000;

/**
 * 插件入口真正携带了可供宿主使用的运行期导出。
 *
 * 入口存在但什么都没导出通常意味着构建配置错误，
 * 这类插件激活后不会注册任何能力，应当显式报错而不是假装成功。
 *
 * @param {object} pluginMain - 从入口提取的运行期导出集合。
 * @returns {boolean} 是否包含至少一个有效导出。
 */
const hasRuntimeExports = (pluginMain) => Boolean(
  typeof pluginMain.pluginDidLoad === 'function'
  || typeof pluginMain.pluginWillUnload === 'function'
  || typeof pluginMain.pluginSettingSaved === 'function'
  || (Array.isArray(pluginMain.settingMenu) && pluginMain.settingMenu.length)
  || (Array.isArray(pluginMain.pluginMenu) && pluginMain.pluginMenu.length)
  || (Array.isArray(pluginMain.ipcHandlers) && pluginMain.ipcHandlers.length)
  || pluginMain.libs
  || (Array.isArray(pluginMain.commands) && pluginMain.commands.length),
);

/**
 * 清理插件在宿主侧登记的运行期注册（IPC handler、命令、interop）。
 *
 * 供禁用与激活失败两条路径复用，保证失败激活不会留下半套注册表。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {object} plugin - 插件对象。
 * @returns {void}
 */
const cleanupRuntimeRegistrations = (loader, plugin) => {
  const ipc = appManager.getIpc();
  if (plugin.ipcHandlers?.length && ipc) {
    plugin.ipcHandlers.forEach((handler) => {
      ipc.removeHandler(`${handler.type}@${plugin.packageName}`, plugin.packageName);
    });
  }
  pluginInterop.unregister(plugin.packageName);
  titleBarRegistry.clearTitleBarActions(plugin.packageName);
  if (plugin.commands?.length) {
    plugin.commands.forEach((command) => {
      loader.runtimeCommandHandlers.delete(command.id);
    });
  }
};

/**
 * 规范化插件运行期导出的命令定义。
 *
 * 兼容数组和对象两种写法，统一转换为 `{ id, handler }` 结构。
 *
 * @param {Array<object>|Record<string, Function>|undefined|null} commands
 * 插件运行期导出的命令定义。
 * @returns {Array<{id: string, handler: Function}>} 可执行命令列表。
 */
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

/**
 * 在插件激活完成后执行可选的 `pluginDidLoad` 生命周期。
 *
 * @param {object} plugin - 已激活的插件对象。
 * @returns {void}
 */
const processPlugin = (plugin) => {
  if (typeof plugin.pluginDidLoad === 'function') {
    plugin.pluginDidLoad();
  }
};

/**
 * 确保插件的静态元数据（settingMenu 等声明式导出）已读入插件对象。
 *
 * 与激活的区别：这里只加载入口模块并合并声明式导出，供菜单与设置面板在
 * 插件激活前读取（类似 VSCode 从 manifest 读取静态 contributes）；
 * 不注册 IPC / 命令 / libs，也不执行 pluginDidLoad。pluginMenu 的点击
 * 语义伴随激活，仍在激活时合并。
 *
 * 入口模块经由 require 缓存与激活共享，预读不会导致顶层代码重复执行；
 * 停用/卸载时的按插件缓存清理同样保证 dev 重建后能读到最新产物。
 *
 * 隔离插件（plugin.isolated）的入口运行在 utilityProcess，主进程不做预读，
 * 避免顶层代码在两个进程各执行一次。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {string} packageName - 插件包名。
 * @returns {object} 插件对象（加载成功时带 settingMenu 与 metadataLoaded 标记）。
 */
const ensurePluginMetadata = (loader, packageName) => {
  const plugin = loader.getPlugin(packageName);
  if (!plugin || plugin.active || plugin.metadataLoaded) {
    return plugin;
  }
  if (plugin.isolated || !plugin.exports) {
    return plugin;
  }
  try {
    const pluginExports = path.join(plugin.pluginPath, plugin.exports);
    const pluginImport = requireFresh(`${pluginExports}`);
    plugin.settingMenu = pluginImport.settingMenu;
    plugin.metadataLoaded = true;
  } catch (err) {
    // 入口缺失/损坏时交由激活流程呈现 build-missing / load-error，
    // 这里保持插件对象不变，菜单侧表现为不展示「设置」项
    logger.warn(`[plugin] 读取插件静态元数据失败: ${packageName}`, {
      error: err.message,
    });
  }
  return plugin;
};

/**
 * 触发与某个激活事件匹配的插件集合。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {string} eventName - 激活事件名。
 * @returns {Array<object>} 被匹配并尝试激活的插件列表。
 */
const triggerActivation = (loader, eventName) => {
  const targets = loader.plugins.filter((plugin) => (
    plugin.enabled && plugin.activationEvents.includes(eventName)
  ));
  targets.forEach((plugin) => {
    loader.enablePlugin(plugin.packageName, true);
  });
  return targets;
};

/**
 * 触发插件视图激活。
 *
 * 对声明 `onView` 的插件，总是通过 `enablePlugin()` 确保最新视图状态；
 * 对未激活的插件也会执行一次懒加载。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {string} packageName - 插件包名。
 * @returns {object} 已激活或已存在的插件对象。
 */
const triggerViewActivation = (loader, packageName) => {
  const plugin = loader.getPlugin(packageName);
  if (!plugin) {
    throw new Error(`插件 "${packageName}" 不存在`);
  }
  if (
    plugin.activationEvents.includes(ACTIVATION_ON_VIEW)
    || !plugin.active
  ) {
    return loader.enablePlugin(packageName);
  }
  return plugin;
};

/**
 * 执行某个已注册的插件命令。
 *
 * 若命令所属插件尚未激活，会先触发插件启用。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {string} commandId - 命令 ID。
 * @param {...any} args - 命令参数。
 * @returns {any} 运行期命令处理器的返回值。
 */
const executeCommand = (loader, commandId, ...args) => {
  const commandMeta = loader.commandRegistry.get(commandId);
  if (!commandMeta) {
    throw new Error(`命令 "${commandId}" 未注册`);
  }
  loader.enablePlugin(commandMeta.pluginId);
  const runtimeCommand = loader.runtimeCommandHandlers.get(commandId);
  if (!runtimeCommand) {
    throw new Error(`命令 "${commandId}" 没有可执行的处理函数`);
  }
  return runtimeCommand.handler(...args);
};

/**
 * 根据 IPC 懒激活索引，确保目标插件已完成加载。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {string} channelType - IPC 通道类型。
 * @returns {boolean} 是否找到了对应插件并触发了准备流程。
 */
const ensurePluginIpcReady = (loader, channelType) => {
  const pluginId = loader.ipcActivationRegistry.get(channelType);
  if (!pluginId) {
    return false;
  }
  loader.enablePlugin(pluginId);
  return true;
};

/**
 * 获取依赖某个插件的所有插件。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {string} packageName - 目标插件包名。
 * @returns {Array<object>} 依赖该插件的插件列表。
 */
const getDependents = (loader, packageName) => loader.plugins.filter(
  (plugin) => Array.isArray(plugin.dependencies) && plugin.dependencies.includes(packageName),
);

/**
 * 启用插件并加载其运行期导出。
 *
 * 这个流程会完成：
 * - 插件缺失时的即时回读
 * - 依赖校验与前置插件启用
 * - 入口模块加载
 * - IPC / 命令 / libs 注册
 * - 生命周期调用与状态刷新
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {string} packageName - 插件包名。
 * @param {boolean} [init=false] - 是否由初始化阶段触发。
 * @returns {object} 启用后的插件对象。
 */
const enablePlugin = (loader, packageName, init = false) => {
  let plugin = loader.getPlugin(packageName);
  if (!plugin) {
    const pluginPath = resolvePluginPath(packageName);
    plugin = readPluginSafe(pluginPath, {
      source: PLUGIN_SOURCE_RELEASE,
      devPlugins: loader.getPlugins().filter((item) => item.dev),
    });
    logger.debug('[plugin] reload plugin: ', { plugin });
    if (plugin) {
      loader.plugins.push(plugin);
      loader.buildDependencyGraph();
      loader.rebuildActivationIndexes();
    }
  }

  // readPluginSafe 在开发插件覆盖同名正式插件等场景会返回 false，
  // 此时若列表中能找到该插件则复用，否则直接中止，避免对 false 做 Object.assign
  if (!plugin) {
    const fallbackPlugin = loader.getPlugin(packageName);
    if (!fallbackPlugin) {
      logger.warn(`[plugin] enable aborted, plugin not readable: ${packageName}`);
      return undefined;
    }
    plugin = fallbackPlugin;
  }

  Object.assign(plugin, {
    dependencies: plugin.dependencies || [],
    optionalDependencies: plugin.optionalDependencies || [],
    contributes: plugin.contributes || { commands: [] },
    blockedBy: plugin.blockedBy || [],
    missingDependencies: plugin.missingDependencies || [],
    commands: plugin.commands || [],
  });

  if (plugin.active || loader.activatingPlugins.has(packageName)) {
    return plugin;
  }

  Object.assign(plugin, refreshPluginStatus(plugin));
  if (plugin.available === false) {
    loader.emit('plugin:error', {
      plugin,
      pluginId: packageName,
      error: new Error(plugin.statusText),
      operation: 'enable',
    });
    return plugin;
  }

  const disabledDependencies = plugin.dependencies.filter((dependencyId) => {
    const dependency = loader.getPlugin(dependencyId);
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
    loader.emit('plugin:error', {
      plugin,
      pluginId: packageName,
      error: new Error(plugin.statusText),
      operation: 'enable',
    });
    return plugin;
  }

  loader.activatingPlugins.add(packageName);
  Object.assign(plugin, applyPluginStatus(plugin, PLUGIN_STATUS_ACTIVATING));
  // 无论激活以何种方式退出（成功、异常、隔离进程超时），
  // 都必须清理“激活中”标记，否则插件会被永久卡在无法再次激活的状态
  try {
    plugin.dependencies.forEach((dependencyId) => {
      loader.enablePlugin(dependencyId, true);
    });

    if (plugin.isolated) {
      return activateIsolatedPlugin(loader, plugin, {
        init,
        cleanup: (target) => cleanupRuntimeRegistrations(loader, target),
      });
    }

    const activatedAt = Date.now();
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
        loader.emit('plugin:error', {
          plugin: plugin || null,
          pluginId: packageName,
          error: err,
          operation: 'enable',
        });
        return plugin;
      }
    }

    if (plugin.exports && !hasRuntimeExports(pluginMain)) {
      const message = '插件入口未导出任何插件 API（pluginDidLoad / ipcHandlers / commands 等），请检查入口构建产物';
      logger.error(`[plugin] ${packageName}: ${message}`);
      Object.assign(
        plugin,
        applyPluginStatus(plugin, PLUGIN_STATUS_LOAD_ERROR, message),
        { enabled: false },
      );
      loader.emit('plugin:error', {
        plugin,
        pluginId: packageName,
        error: new Error(message),
        operation: 'enable',
      });
      return plugin;
    }

    Object.assign(plugin, createRuntimeState(), refreshPluginStatus(plugin));
    pluginMain.enabled = true;
    pluginMain.active = true;
    pluginMain.loadTime = Date.now();
    pluginMain.loadDuration = pluginMain.loadTime - activatedAt;
    mainStore.config.set(`plugin.${plugin.packageName}.enabled`, true);

    const mergedPlugin = Object.assign(plugin, pluginMain || {});

    if (mergedPlugin.ipcHandlers && mergedPlugin.ipcHandlers.length) {
      mergedPlugin.ipcHandlers.forEach((handler) => {
        const ipc = appManager.getIpc();
        if (ipc) {
          ipc.appendHandler(
            `${handler.type}@${mergedPlugin.packageName}`,
            handler.handler,
            { owner: mergedPlugin.packageName },
          );
        }
      });
    }

    if (mergedPlugin.commands?.length) {
      mergedPlugin.commands.forEach((command) => {
        loader.runtimeCommandHandlers.set(command.id, {
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

    // pluginDidLoad 的异常不允许向上传播：宿主需要保持状态机一致，
    // 并清掉刚才注册的 IPC / 命令 / interop，让插件停留在可重试的 load-error 状态
    try {
      processPlugin(mergedPlugin);
    } catch (err) {
      logger.error(`[plugin] pluginDidLoad 执行失败: ${mergedPlugin.packageName}`, err);
      cleanupRuntimeRegistrations(loader, mergedPlugin);
      Object.assign(
        mergedPlugin,
        applyPluginStatus(
          mergedPlugin,
          PLUGIN_STATUS_LOAD_ERROR,
          `pluginDidLoad 执行失败：${err.message}`,
        ),
        { enabled: false, active: false },
      );
      mainStore.config.set(`plugin.${mergedPlugin.packageName}.enabled`, false);
      loader.emit('plugin:error', {
        plugin: mergedPlugin,
        pluginId: packageName,
        error: err,
        operation: 'didLoad',
      });
      return mergedPlugin;
    }

    if (mergedPlugin.loadDuration > SLOW_ACTIVATION_THRESHOLD) {
      logger.warn(`[plugin] 插件 "${mergedPlugin.packageName}" 激活耗时 ${mergedPlugin.loadDuration}ms，建议改用 onAppReady/onView 等延迟激活事件`);
    }

    Object.assign(mergedPlugin, refreshPluginStatus(mergedPlugin));
    loader.emit('plugin:enabled', {
      plugin: mergedPlugin,
      pluginId: mergedPlugin.packageName,
      isInit: init,
    });

    return mergedPlugin;
  } finally {
    loader.activatingPlugins.delete(packageName);
  }
};

/**
 * 禁用插件并清理其运行期副作用。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {string} packageName - 插件包名。
 * @param {object|boolean} [options={}] - 禁用选项，兼容旧布尔参数写法。
 * @param {boolean} [options.isUninstall=false] - 是否由卸载流程触发。
 * @param {boolean} [options.keepDisabledRecord=!isUninstall]
 * 是否保留插件对象并写回“已禁用”状态。
 * @param {boolean} [options.persistState=!isUninstall]
 * 是否把启用状态持久化到配置中心。
 * @returns {boolean} 是否成功处理禁用流程。
 */
const disablePlugin = (loader, packageName, options = {}) => {
  const normalizedOptions = typeof options === 'boolean'
    ? { isUninstall: options }
    : options;
  const {
    isUninstall = false,
    keepDisabledRecord = !isUninstall,
    persistState = !isUninstall,
  } = normalizedOptions;
  const plugin = loader.getPlugin(packageName);
  if (!plugin) {
    logger.warn(`[plugin] disable skipped, plugin not found: ${packageName}`);
    return false;
  }
  Object.assign(plugin, {
    enabled: false,
    active: false,
  });

  if (plugin.ipcHandlers && plugin.ipcHandlers.length) {
    plugin.ipcHandlers.forEach((handler) => {
      const ipc = appManager.getIpc();
      if (ipc) {
        ipc.removeHandler(`${handler.type}@${plugin.packageName}`, plugin.packageName);
      }
    });
  }

  pluginInterop.unregister(plugin.packageName);
  titleBarRegistry.clearTitleBarActions(plugin.packageName);
  if (plugin.commands?.length) {
    plugin.commands.forEach((command) => {
      loader.runtimeCommandHandlers.delete(command.id);
    });
  }

  if (plugin.isolated) {
    // 隔离插件的清理在子进程侧完成：通知卸载、等待退出并杀掉进程。
    // pluginWillUnload 的异常不允许中断后续清理
    deactivateIsolatedPlugin(loader, plugin);
  } else if (typeof plugin.pluginWillUnload === 'function') {
    try {
      plugin.pluginWillUnload();
    } catch (err) {
      logger.error(`[plugin] pluginWillUnload 执行失败: ${plugin.packageName}`, err);
    }
  }

  if (appManager.getChildWin(`plugin-window-${packageName}`)) {
    appManager.getChildWin(`plugin-window-${packageName}`).close();
  }

  const cacheKeys = Object.keys(requireFresh.cache);
  const packagePattern = `${path.sep}${plugin.packageName}${path.sep}`.toLowerCase();
  const normalizedPluginPath = plugin.pluginPath ? plugin.pluginPath.toLowerCase() : '';

  let deletedCount = 0;
  cacheKeys.forEach((key) => {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes(packagePattern)
      || (normalizedPluginPath && lowerKey.startsWith(normalizedPluginPath))
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
  // 元数据与运行期导出随停用一并失效：require 缓存已按插件清理，
  // 下次菜单打开或激活会重新读取最新入口产物
  delete plugin.metadataLoaded;
  delete plugin.settingMenu;
  delete plugin.pluginMenu;
  const preservedBlockedBy = Array.isArray(plugin.blockedBy) ? [...plugin.blockedBy] : [];
  const preservedMissingDependencies = Array.isArray(plugin.missingDependencies)
    ? [...plugin.missingDependencies]
    : [];
  if (keepDisabledRecord && !isUninstall) {
    const nextPlugin = readPluginSafe(plugin.pluginPath, {
      source: isDev ? PLUGIN_SOURCE_DEV : PLUGIN_SOURCE_RELEASE,
      devPlugins: isDev ? null : loader.getPlugins().filter((item) => item.dev),
    });
    nextPlugin.enabled = false;
    nextPlugin.dev = isDev;
    Object.assign(plugin, nextPlugin);
    plugin.blockedBy = uniqueStrings([...plugin.blockedBy, ...preservedBlockedBy]);
    plugin.missingDependencies = uniqueStrings([
      ...plugin.missingDependencies,
      ...preservedMissingDependencies,
    ]);
    if (persistState) {
      mainStore.config.set(`plugin.${plugin.packageName}.enabled`, false);
    }
  }

  getDependents(loader, packageName).forEach((dependent) => {
    if (dependent.enabled) {
      const blockedBy = uniqueStrings([...dependent.blockedBy, packageName]);
      Object.assign(dependent, { blockedBy });
      loader.disablePlugin(dependent.packageName, {
        keepDisabledRecord: true,
        persistState: true,
      });
      Object.assign(dependent, refreshPluginStatus(dependent));
    }
  });
  Object.assign(plugin, refreshPluginStatus(plugin));

  loader.emit('plugin:disabled', {
    plugin,
    pluginId: packageName,
    isUninstall,
  });
  return true;
};

/**
 * 以“先禁用再启用”的方式重启插件。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {string} packageName - 插件包名。
 * @returns {object} 重启后的插件对象。
 */
const restartPlugin = (loader, packageName) => {
  const plugin = loader.getPlugin(packageName);
  if (!plugin) {
    throw new Error(`插件 "${packageName}" 不存在`);
  }
  loader.disablePlugin(packageName, {
    keepDisabledRecord: false,
    persistState: false,
  });
  return loader.enablePlugin(packageName);
};

/**
 * 应用退出前关闭所有已启用插件。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @returns {void}
 */
const appClose = (loader) => {
  loader.plugins.forEach((plugin) => {
    if (plugin.enabled) {
      loader.disablePlugin(plugin.packageName, {
        keepDisabledRecord: false,
        persistState: false,
      });
    }
  });
};

/**
 * 获取已激活插件暴露的 `libs` 访问对象。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {string} pluginId - 插件包名。
 * @returns {object|undefined} 访问对象；插件未激活时返回 `undefined`。
 */
const access = (loader, pluginId) => {
  const plugin = loader.getPlugin(pluginId);
  return plugin && plugin.active ? plugin.libs : undefined;
};

/**
 * 通知插件设置已被保存，并对外广播状态事件。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {string} pluginId - 插件包名。
 * @returns {void}
 */
const onPluginSettingSave = (loader, pluginId) => {
  const plugin = loader.getPlugin(pluginId);
  if (plugin && plugin.active) {
    try {
      if (plugin.isolated) {
        notifySettingSaved(plugin);
      } else if (typeof plugin.pluginSettingSaved === 'function') {
        plugin.pluginSettingSaved();
      }
    } catch (err) {
      logger.error(`[plugin] pluginSettingSaved 执行失败: ${pluginId}`, err);
    }
  }
  loader.emit('plugin:setting-changed', { plugin: plugin || null, pluginId });
};

export {
  access,
  appClose,
  disablePlugin,
  enablePlugin,
  ensurePluginIpcReady,
  ensurePluginMetadata,
  executeCommand,
  getDependents,
  onPluginSettingSave,
  restartPlugin,
  triggerActivation,
  triggerViewActivation,
};
