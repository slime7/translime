/* eslint-disable no-param-reassign */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { utilityProcess } from 'electron';
import mainStore from '../../utils/useMainStore';
import appManager from '../../utils/useAppManager';
import logger from '../../utils/logger';
import { PLUGIN_STATUS_LOAD_ERROR } from './constants';
import {
  applyPluginStatus,
  refreshPluginStatus,
} from './metadata';

/**
 * 插件隔离运行模式（`plugin.isolated: true`）的宿主侧实现。
 *
 * 插件主进程代码被 fork 进独立的 utilityProcess，宿主通过消息协议桥接
 * IPC handler、命令与生命周期调用。插件崩溃（进程退出）不再影响宿主与
 * 其他插件。该模式为可选能力：
 * - 不支持 `libs` / `usePluginInterop`（跨进程对象引用无法透传），
 *   子进程会告警且宿主不注册 interop；
 * - 不支持 `getMainStore` / `usePluginConfig`（SDK 在隔离环境会明确报错）；
 * - `sendToClient` 仅支持 `null`（主窗口）与 `'all'` 两种目标。
 */

const ACTIVATION_TIMEOUT = 15000;
const UNLOAD_TIMEOUT = 3000;

/**
 * 隔离子进程协议通道名。
 */
const CHILD_CHANNEL = {
  READY: 'ready',
  REGISTER: 'register',
  IPC_RESULT: 'ipc-result',
  COMMAND_RESULT: 'command-result',
  SEND_TO_CLIENT: 'send-to-client',
  LOG: 'log',
  LOAD_ERROR: 'load-error',
  UNLOADED: 'unloaded',
};

const HOST_CHANNEL = {
  ACTIVATE: 'activate',
  IPC_INVOKE: 'ipc-invoke',
  COMMAND_INVOKE: 'command-invoke',
  SETTING_SAVED: 'setting-saved',
  UNLOAD: 'unload',
};

/**
 * @type {Map<string, object>} packageName -> 隔离控制器
 */
const controllers = new Map();

const childEntryPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../isolated-child/index.cjs',
);

/**
 * 解析隔离插件的主进程入口绝对路径。
 *
 * @param {object} plugin - 插件对象。
 * @returns {string|null} 入口绝对路径；清单未声明入口时为 `null`。
 */
const resolveEntry = (plugin) => {
  if (!plugin.exports) {
    return null;
  }
  return path.join(plugin.pluginPath, plugin.exports);
};

/**
 * 标记插件进入 load-error 状态并广播错误事件。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {object} plugin - 插件对象。
 * @param {Error|string} error - 错误。
 * @param {string} operation - 触发阶段。
 * @returns {void}
 */
const markLoadError = (loader, plugin, error, operation) => {
  const message = error instanceof Error ? error.message : String(error);
  Object.assign(
    plugin,
    applyPluginStatus(plugin, PLUGIN_STATUS_LOAD_ERROR, message),
    { enabled: false, active: false },
  );
  mainStore.config.set(`plugin.${plugin.packageName}.enabled`, false);
  loader.emit('plugin:error', {
    plugin,
    pluginId: plugin.packageName,
    error: error instanceof Error ? error : new Error(message),
    operation,
  });
};

/**
 * 向隔离子进程发起一次请求并等待回包。
 *
 * @param {object} controller - 隔离控制器。
 * @param {object} message - 消息体（不含 reqId）。
 * @param {number} [timeout=0] - 超时毫秒数，0 表示不设超时。
 * @returns {Promise<any>} 子进程回包数据。
 */
const postRequest = (controller, message, timeout = 0) => new Promise((resolve, reject) => {
  const reqId = `${controller.plugin.packageName}:${controller.reqIdCounter}`;
  controller.reqIdCounter += 1;
  let timer = null;
  controller.pending.set(reqId, {
    resolve: (value) => {
      if (timer) clearTimeout(timer);
      resolve(value);
    },
    reject: (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    },
  });
  if (timeout > 0) {
    timer = setTimeout(() => {
      controller.pending.delete(reqId);
      reject(new Error(`隔离子进程响应超时：${message.channel} (${reqId})`));
    }, timeout);
  }
  controller.child.postMessage({ ...message, reqId });
});

/**
 * 拒绝所有等待中的桥接请求。
 *
 * @param {object} controller - 隔离控制器。
 * @param {Error} err - 错误。
 * @returns {void}
 */
const rejectPending = (controller, err) => {
  controller.pending.forEach((pending) => pending.reject(err));
  controller.pending.clear();
};

/**
 * 停止子进程：标记 stopping 并延迟强杀，子进程正常退出时取消。
 *
 * @param {object} controller - 隔离控制器。
 * @returns {void}
 */
const stopChild = (controller) => {
  if (!controller.child) {
    return;
  }
  controller.stopping = true;
  const { child } = controller;
  const killer = setTimeout(() => {
    try {
      child.kill();
    } catch (err) {
      logger.warn('[plugin] 隔离子进程强杀失败', err);
    }
  }, UNLOAD_TIMEOUT);
  child.once('exit', () => clearTimeout(killer));
};

/**
 * 以指定所有者向 IPC 注册表登记桥接 handler。
 *
 * @param {object} controller - 隔离控制器。
 * @param {string} type - 插件声明的原始 IPC type。
 * @returns {void}
 */
const registerIpcBridge = (controller, type) => {
  const ipc = appManager.getIpc();
  if (!ipc) {
    return;
  }
  const { plugin } = controller;
  ipc.appendHandler(`${type}@${plugin.packageName}`, () => async (...args) => {
    if (!controller.child) {
      throw new Error(`插件 "${plugin.packageName}" 的隔离进程已退出`);
    }
    return postRequest(controller, {
      channel: HOST_CHANNEL.IPC_INVOKE,
      type,
      args,
    });
  }, { owner: plugin.packageName });
};

/**
 * 创建隔离控制器。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {object} plugin - 插件对象。
 * @param {Function} cleanup - 宿主侧注册清理回调（由 runtime 提供，避免循环依赖）。
 * @returns {object} 隔离控制器。
 */
const createController = (loader, plugin, cleanup) => {
  const controller = {
    plugin,
    child: null,
    pending: new Map(),
    reqIdCounter: 1,
    stopping: false,
    activationTimer: null,
    activatedAt: 0,
    init: false,
    cleanup,
  };
  controllers.set(plugin.packageName, controller);
  return controller;
};

/**
 * 处理子进程退出：非主动停止时视为崩溃。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {object} controller - 隔离控制器。
 * @param {number} code - 退出码。
 * @returns {void}
 */
const handleChildExit = (loader, controller, code) => {
  const { plugin } = controller;
  // 拒绝处理已被替换或主动停止的旧子进程，防止重启竞态误伤新实例
  if (controllers.get(plugin.packageName) !== controller) {
    return;
  }
  rejectPending(controller, new Error('隔离子进程已退出'));
  if (controller.activationTimer) {
    clearTimeout(controller.activationTimer);
    controller.activationTimer = null;
  }
  controller.child = null;
  controllers.delete(plugin.packageName);
  if (controller.cleanup) {
    controller.cleanup(plugin);
  }
  if (controller.stopping) {
    return;
  }
  logger.error(`[plugin] 隔离进程退出: ${plugin.packageName} (code=${code})`);
  if (plugin.enabled || plugin.active) {
    markLoadError(loader, plugin, `插件隔离进程异常退出（code=${code}）`, 'crash');
  }
};

/**
 * 处理子进程消息。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {object} controller - 隔离控制器。
 * @param {{channel: string}} message - 子进程消息。
 * @returns {void}
 */
const handleChildMessage = (loader, controller, message) => {
  if (!message || typeof message !== 'object') {
    return;
  }
  const { plugin } = controller;
  const ipc = appManager.getIpc();

  if (message.channel === CHILD_CHANNEL.READY) {
    if (controller.activationTimer) {
      clearTimeout(controller.activationTimer);
      controller.activationTimer = null;
    }
    controller.child.postMessage({
      channel: HOST_CHANNEL.ACTIVATE,
      pluginId: plugin.packageName,
      payload: {
        title: plugin.title,
        version: plugin.version,
        isDev: Boolean(plugin.dev),
        hostVersion: mainStore.APP_VERSION,
        settings: mainStore.config.get(`plugin.${plugin.packageName}.settings`, {}),
        windowUrl: plugin.windowUrl || null,
      },
    });
    return;
  }

  if (message.channel === CHILD_CHANNEL.REGISTER) {
    const ipcTypes = Array.isArray(message.ipcTypes) ? message.ipcTypes.map(String) : [];
    const commandIds = Array.isArray(message.commands) ? message.commands.map(String) : [];
    if (message.hasLibs) {
      logger.warn(`[plugin] 隔离模式暂不支持 libs 导出（跨进程无法透传对象引用），已忽略 "${plugin.packageName}" 的 libs`);
    }
    controller.cleanup?.(plugin);
    plugin.ipcHandlers = ipcTypes.map((type) => ({ type }));
    ipcTypes.forEach((type) => registerIpcBridge(controller, type));
    plugin.commands = commandIds.map((id) => ({ id }));
    commandIds.forEach((id) => {
      loader.runtimeCommandHandlers.set(id, {
        pluginId: plugin.packageName,
        handler: (...args) => postRequest(controller, {
          channel: HOST_CHANNEL.COMMAND_INVOKE,
          id,
          args,
        }),
      });
    });
    plugin.libs = null;
    plugin.enabled = true;
    plugin.active = true;
    plugin.loadTime = Date.now();
    plugin.loadDuration = plugin.loadTime - controller.activatedAt;
    mainStore.config.set(`plugin.${plugin.packageName}.enabled`, true);
    Object.assign(plugin, refreshPluginStatus(plugin));
    if (plugin.loadDuration > 3000) {
      logger.warn(`[plugin] 隔离插件 "${plugin.packageName}" 激活耗时 ${plugin.loadDuration}ms`);
    }
    loader.emit('plugin:enabled', {
      plugin,
      pluginId: plugin.packageName,
      isInit: controller.init,
    });
    return;
  }

  if (message.channel === CHILD_CHANNEL.IPC_RESULT || message.channel === CHILD_CHANNEL.COMMAND_RESULT) {
    const pending = controller.pending.get(message.reqId);
    if (pending) {
      controller.pending.delete(message.reqId);
      if (message.err) {
        pending.reject(new Error(message.err));
      } else {
        pending.resolve(message.data);
      }
    }
    return;
  }

  if (message.channel === CHILD_CHANNEL.SEND_TO_CLIENT) {
    if (ipc) {
      ipc.sendToClient(message.type, message.data, message.target === 'all' ? 'all' : null);
    }
    return;
  }

  if (message.channel === CHILD_CHANNEL.LOG) {
    const allowedLevels = ['error', 'warn', 'info', 'verbose', 'debug', 'silly'];
    const level = allowedLevels.includes(message.level) ? message.level : 'info';
    logger[level](`[plugin:${plugin.packageName}]`, ...(Array.isArray(message.args) ? message.args : [message.args]));
    return;
  }

  if (message.channel === CHILD_CHANNEL.LOAD_ERROR) {
    markLoadError(loader, plugin, message.error || '隔离子进程激活失败', 'enable');
    stopChild(controller);
    return;
  }

  if (message.channel === CHILD_CHANNEL.UNLOADED) {
    stopChild(controller);
  }
};

/**
 * 激活隔离插件：fork 子进程并等待其完成 pluginDidLoad 与注册。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {object} plugin - 插件对象。
 * @param {object} [options={}] - 激活选项。
 * @param {boolean} [options.init=false] - 是否由初始化阶段触发。
 * @param {Function} [options.cleanup] - 宿主侧注册清理回调。
 * @returns {object} 插件对象。
 */
const activateIsolatedPlugin = (loader, plugin, { init = false, cleanup = null } = {}) => {
  // 隔离激活是异步握手，期间可能被懒激活/视图激活再次触发：已有存活的
  // 控制器时直接复用，避免重复 fork 两个子进程
  const existingController = controllers.get(plugin.packageName);
  if (existingController && !existingController.stopping) {
    return plugin;
  }
  if (existingController) {
    controllers.delete(plugin.packageName);
  }

  const entryPath = resolveEntry(plugin);
  if (!entryPath) {
    markLoadError(loader, plugin, '隔离插件缺少主进程入口（package.json main）', 'enable');
    return plugin;
  }

  const controller = createController(loader, plugin, cleanup);
  controller.init = init;
  controller.activatedAt = Date.now();

  try {
    controller.child = utilityProcess.fork(childEntryPath, [], {
      serviceName: `plugin:${plugin.packageName}`,
      env: {
        ...process.env,
        TRANSLIME_ISOLATED_PLUGIN: plugin.packageName,
        TRANSLIME_PLUGIN_ENTRY: entryPath,
      },
    });
  } catch (err) {
    controllers.delete(plugin.packageName);
    markLoadError(loader, plugin, `隔离子进程启动失败：${err.message}`, 'enable');
    return plugin;
  }

  controller.child.on('message', (message) => handleChildMessage(loader, controller, message));
  controller.child.on('exit', (code) => handleChildExit(loader, controller, code));

  controller.activationTimer = setTimeout(() => {
    if (controllers.get(plugin.packageName) !== controller || plugin.active) {
      return;
    }
    markLoadError(
      loader,
      plugin,
      `隔离子进程激活超时（${ACTIVATION_TIMEOUT}ms），请检查插件 pluginDidLoad 是否阻塞`,
      'enable',
    );
    stopChild(controller);
  }, ACTIVATION_TIMEOUT);

  return plugin;
};

/**
 * 停用隔离插件：通知子进程执行 pluginWillUnload 后退出。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {object} plugin - 插件对象。
 * @returns {void}
 */
const deactivateIsolatedPlugin = (loader, plugin) => {
  const controller = controllers.get(plugin.packageName);
  if (!controller || !controller.child) {
    controllers.delete(plugin.packageName);
    return;
  }
  try {
    controller.child.postMessage({ channel: HOST_CHANNEL.UNLOAD });
    stopChild(controller);
  } catch (err) {
    logger.warn(`[plugin] 通知隔离子进程卸载失败: ${plugin.packageName}`, err);
    try {
      controller.child.kill();
    } catch (killErr) {
      logger.warn(`[plugin] 隔离子进程强杀失败: ${plugin.packageName}`, killErr);
    }
    controllers.delete(plugin.packageName);
  }
};

/**
 * 通知隔离插件设置已保存。
 *
 * @param {object} plugin - 插件对象。
 * @returns {void}
 */
const notifySettingSaved = (plugin) => {
  const controller = controllers.get(plugin.packageName);
  if (controller?.child) {
    controller.child.postMessage({ channel: HOST_CHANNEL.SETTING_SAVED });
  }
};

export {
  activateIsolatedPlugin,
  deactivateIsolatedPlugin,
  notifySettingSaved,
};
