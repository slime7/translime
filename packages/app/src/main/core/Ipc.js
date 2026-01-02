import ipcHandler from './ipcHandler';

export default class Ipc {
  constructor(listener, sender) {
    this.listener = listener;
    this.sender = sender;
    this.handlerList = ipcHandler(this);
    this.listener.on('ipc-msg', (ev, { type, data }) => {
      if (typeof this.handlerList[type] === 'function') {
        this.handlerList[type](data, ev.sender);
      }
    });
    this.listener.handle('ipc-fn', async (ev, { type, args }) => {
      if (typeof this.handlerList[type] === 'function') {
        try {
          const data = await this.handlerList[type](...args);
          return { data, err: null };
        } catch (err) {
          return { data: null, err: err.message };
        }
      }
      return { data: null, err: `IPC 处理函数 [${type}] 未找到` };
    });
  }

  sendMsg(channel, msgBody, clientWin) {
    if (clientWin && !clientWin.isDestroyed()) {
      if (clientWin.webContents) {
        clientWin.webContents.send(channel, msgBody);
      } else {
        clientWin.send(channel, msgBody);
      }
    } else if (!this.sender.isDestroyed()) {
      this.sender.send(channel, msgBody);
    }
  }

  sendToClient(type, data, clientWin = null) {
    this.sendMsg('ipc-reply', {
      type,
      data,
    }, clientWin);
  }

  appendHandler(type, handlerFn) {
    if (!this.handlerList[type]) {
      this.handlerList[type] = handlerFn({ sendToClient: this.sendToClient.bind(this) });
      return true;
    }
    return false;
  }

  removeHandler(type) {
    if (this.handlerList[type]) {
      delete this.handlerList[type];
    }
  }
}
