import ipcHandler from './ipcHandler';

export default class Ipc {
  constructor(listener, sender) {
    this.listener = listener;
    this.sender = sender;
    this.handlerList = ipcHandler(this);
    this.listener.on('ipc-msg', (ev, { type, data }) => this.handlerList[type](data));
    this.listener.handle('ipc-fn', async (ev, { type, args }) => {
      try {
        const data = await this.handlerList[type](...args);
        return { data, err: null };
      } catch (err) {
        return { data: null, err: err.message };
      }
    });
  }

  sendMsg(channel, msgBody, clientWin) {
    if (!clientWin) {
      this.sender.send(channel, msgBody);
    } else {
      clientWin.send(channel, msgBody);
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
