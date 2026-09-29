import { webContents } from 'electron';
import ipcHandler from './ipcHandler';
import appManager from '../utils/useAppManager';
import logger from '../utils/logger';
import pluginInterop from './pluginInterop';
import ipcContext from './ipcContext';
import { resolveSenderPluginId } from './plugin-loader/pluginSenderRegistry';

const asyncLocalStorage = ipcContext;

const HOST_OWNER = '__host__';
const PLUGIN_ID_SUFFIX = '@translime-plugin-';

/**
 * 通道所有者登记表（模块级，与共享的 handlerList 同生命周期）。
 *
 * @type {Map<string, string>}
 */
const handlerOwners = new Map();

/**
 * 解析 IPC type 指向的目标插件。
 *
 * 插件 handler 注册时统一带 `事件名@插件ID` 后缀，据此区分插件通道与宿主通道。
 *
 * @param {string} type - IPC 通道类型。
 * @returns {string|null} 目标插件包名；宿主通道返回 `null`。
 */
const extractTargetPluginId = (type) => {
  if (typeof type !== 'string') {
    return null;
  }
  const suffixIndex = type.indexOf(PLUGIN_ID_SUFFIX);
  if (suffixIndex <= 0) {
    return null;
  }
  return type.slice(suffixIndex + 1);
};

/**
 * 校验发送方是否有权调用该通道。
 *
 * 规则：已归属插件的发送方只能调用自身通道；跨插件访问仅对
 * 暴露了 libs（pluginInterop 已注册）的插件放行，其余一律拒绝。
 * 主机侧发送方（宿主窗口等未归属的 WebContents）不受限制。
 *
 * @param {string} type - IPC 通道类型。
 * @param {import('electron').WebContents} sender - 发送方。
 * @returns {string|null} 拒绝原因；允许时返回 `null`。
 */
const assertIpcAllowed = (type, sender) => {
  const targetPluginId = extractTargetPluginId(type);
  if (!targetPluginId) {
    return null;
  }
  const senderPluginId = resolveSenderPluginId(sender);
  if (!senderPluginId || senderPluginId === targetPluginId) {
    return null;
  }
  appManager.getPluginLoader()?.ensurePluginIpcReady(type);
  if (pluginInterop.getRegisteredPlugins().includes(targetPluginId)) {
    return null;
  }
  return `IPC [${type}] 不允许跨插件调用：插件 "${senderPluginId}" 只能访问自身通道或暴露了 libs 的插件，目标 "${targetPluginId}" 未暴露 libs`;
};

export default class Ipc {
  /**
   * @param {import('electron').IpcMain} listener
   * @param {import('electron').WebContents} sender
   */
  constructor(listener, sender) {
    this.listener = listener;
    this.sender = sender;
    this.handlerList = ipcHandler;
    // 广播给所有窗口与 Webview，绑定为实例字段以避免类方法未使用 this
    this.sendToAllWindows = (type, data) => {
      const allWebContents = webContents.getAllWebContents();
      allWebContents.forEach((wc) => {
        if (!wc.isDestroyed() && !wc.isDevTools) {
          wc.send('ipc-reply', { type, data });
        }
      });
    };

    // 注册通用处理通道
    this.listener.handle('ipc-fn', (ev, { type, args }) => {
      let handler = this.handlerList[type];
      if (!handler) {
        appManager.getPluginLoader()?.ensurePluginIpcReady(type);
        handler = this.handlerList[type];
      }
      if (handler) {
        const denial = assertIpcAllowed(type, ev.sender);
        if (denial) {
          return { data: null, err: denial };
        }
        return asyncLocalStorage.run(ev.sender, async () => {
          try {
            const data = await handler(...(args || []));
            return { data, err: null };
          } catch (err) {
            return { data: null, err: this.describeHandlerError(type, err) };
          }
        });
      }
      return { data: null, err: `IPC handler [${type}] not found` };
    });

    this.listener.on('ipc-msg', (ev, { type, data }) => {
      let handler = this.handlerList[type];
      if (!handler) {
        appManager.getPluginLoader()?.ensurePluginIpcReady(type);
        handler = this.handlerList[type];
      }
      if (handler) {
        const denial = assertIpcAllowed(type, ev.sender);
        if (denial) {
          logger.warn(`[ipc] 拦截 ipc-msg 调用：${denial}`);
          return;
        }
        asyncLocalStorage.run(ev.sender, () => {
          try {
            handler(data);
          } catch (err) {
            logger.error(`[ipc] ipc-msg handler 执行失败：${this.describeHandlerError(type, err)}`);
          }
        });
      }
    });
  }

  /**
   * 生成附带插件归属信息的错误描述，方便把异常定位到具体插件。
   *
   * @param {string} type - IPC 通道类型。
   * @param {Error} err - handler 抛出的异常。
   * @returns {string} 错误消息。
   */
  describeHandlerError(type, err) {
    const owner = this.getHandlerOwner(type);
    if (owner && owner !== HOST_OWNER) {
      return `[${owner}] ${err.message}`;
    }
    return err.message;
  }

  /**
   * 查询通道当前的登记所有者。
   *
   * @param {string} type - IPC 通道类型。
   * @returns {string|null} 所有者标识；宿主内置通道返回 `__host__`。
   */
  getHandlerOwner(type) {
    if (!this.handlerList[type]) {
      return null;
    }
    return handlerOwners.get(type) || HOST_OWNER;
  }

  /**
   * 发送消息到客户端 (仅用于主动推送)
   * @param {string} type 消息类型
   * @param {any} data 消息数据
   * @param {import('electron').BrowserWindow|import('electron').WebContents|'all'} clientWin 目标窗口
   */
  sendToClient(type, data, clientWin = null) {
    if (clientWin === 'all') {
      this.sendToAllWindows(type, data);
      return;
    }
    const target = clientWin || asyncLocalStorage.getStore() || this.sender;
    if (target && !target.isDestroyed()) {
      const targetContents = target.webContents || target;
      targetContents.send('ipc-reply', { type, data });
    }
  }

  /**
   * 发送消息到主窗口
   * @param {string} type 消息类型
   * @param {any} data 消息数据
   */
  sendToMain(type, data) {
    if (this.sender && !this.sender.isDestroyed()) {
      this.sender.send('ipc-reply', { type, data });
    }
  }

  /**
   * 动态添加处理函数 (供插件使用)
   *
   * 带 `owner` 登记后，同一通道不允许被其他所有者抢占：
   * 插件不能覆盖宿主内置通道，也不能注册其他插件的 `事件名@插件ID` 通道；
   * 相同所有者重复注册（如插件重启）则允许原地替换。
   *
   * @param {string} type 通道名称
   * @param {Function} handlerFn 处理函数工厂
   * @param {object} [options] 注册选项
   * @param {string} [options.owner] 登记所有者（通常是插件包名）
   * @returns {boolean} 是否注册成功
   */
  appendHandler(type, handlerFn, options = {}) {
    const owner = options.owner || null;
    const existingOwner = this.getHandlerOwner(type);
    if (existingOwner === HOST_OWNER && owner) {
      logger.warn(`[ipc] 拒绝注册 IPC 通道 [${type}]：不允许插件抢占宿主内置通道`);
      return false;
    }
    if (existingOwner && existingOwner !== HOST_OWNER && owner !== existingOwner) {
      logger.warn(`[ipc] 拒绝注册 IPC 通道 [${type}]：该通道已由 "${existingOwner}" 登记所有`);
      return false;
    }
    const handler = handlerFn({
      sendToClient: this.sendToClient.bind(this),
      sendToMain: this.sendToMain.bind(this),
      sendToAllWindows: this.sendToAllWindows,
    });
    this.handlerList[type] = handler;
    if (owner) {
      handlerOwners.set(type, owner);
    }
    return true;
  }

  /**
   * 移除处理函数
   *
   * 传入 `owner` 时仅允许所有者本人移除，防止插件注销他人通道。
   *
   * @param {string} type 通道名称
   * @param {string} [owner] 登记所有者
   * @returns {boolean} 是否移除成功
   */
  removeHandler(type, owner = null) {
    if (!this.handlerList[type]) {
      return false;
    }
    const existingOwner = this.getHandlerOwner(type);
    if (owner && existingOwner && existingOwner !== owner) {
      logger.warn(`[ipc] 拒绝移除 IPC 通道 [${type}]：登记所有者为 "${existingOwner}"`);
      return false;
    }
    delete this.handlerList[type];
    handlerOwners.delete(type);
    return true;
  }
}
