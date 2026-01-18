import ipcHandler from './ipcHandler';

export default class Ipc {
  /**
   * @param {import('electron').IpcMain} listener
   * @param {import('electron').WebContents} sender
   */
  constructor(listener, sender) {
    this.listener = listener;
    this.sender = sender;
    this.handlerList = ipcHandler;

    // 注册通用处理通道
    this.listener.handle('ipc-fn', async (ev, { type, args }) => {
      const handler = this.handlerList[type];
      if (handler) {
        try {
          const data = await handler(...(args || []));
          return { data, err: null };
        } catch (err) {
          return { data: null, err: err.message };
        }
      }
      return { data: null, err: `IPC handler [${type}] not found` };
    });

    this.listener.on('ipc-msg', (ev, { type, data }) => {
      const handler = this.handlerList[type];
      if (handler) {
        handler(data);
      }
    });
  }

  /**
   * 发送消息到客户端 (仅用于主动推送)
   * @param {string} type 消息类型
   * @param {any} data 消息数据
   * @param {import('electron').BrowserWindow|import('electron').WebContents} clientWin 目标窗口
   */
  sendToClient(type, data, clientWin = null) {
    const target = clientWin || this.sender;
    if (target && !target.isDestroyed()) {
      const webContents = target.webContents || target;
      webContents.send('ipc-reply', { type, data });
    }
  }

  /**
   * 动态添加处理函数 (供插件使用)
   * @param {string} type 通道名称
   * @param {Function} handlerFn 处理函数工厂
   */
  appendHandler(type, handlerFn) {
    const handler = handlerFn({ sendToClient: this.sendToClient.bind(this) });
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
