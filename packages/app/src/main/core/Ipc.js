import { AsyncLocalStorage } from 'node:async_hooks';
import { webContents } from 'electron';
import ipcHandler from './ipcHandler';
import appManager from '../utils/useAppManager';

const asyncLocalStorage = new AsyncLocalStorage();

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
        return asyncLocalStorage.run(ev.sender, async () => {
          try {
            const data = await handler(...(args || []));
            return { data, err: null };
          } catch (err) {
            return { data: null, err: err.message };
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
        asyncLocalStorage.run(ev.sender, () => {
          handler(data);
        });
      }
    });
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
   * @param {string} type 通道名称
   * @param {Function} handlerFn 处理函数工厂
   */
  appendHandler(type, handlerFn) {
    const handler = handlerFn({
      sendToClient: this.sendToClient.bind(this),
      sendToMain: this.sendToMain.bind(this),
      sendToAllWindows: this.sendToAllWindows,
    });
    this.handlerList[type] = handler;
    return true;
  }

  /**
   * 移除处理函数
   * @param {string} type 通道名称
   */
  removeHandler(type) {
    if (this.handlerList[type]) {
      delete this.handlerList[type];
    }
  }
}
