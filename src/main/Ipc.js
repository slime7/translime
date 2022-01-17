import ipcHandler from '@pkg/main/utils/ipcHandler';

export default class Ipc {
  constructor(listener, sender) {
    this.listener = listener;
    this.sender = sender;
    this.handlerList = ipcHandler(this);
    this.listener.on('ipc-msg', (ev, { type, data }) => this.handlerList[type](data));
    this.listener.handle('ipc-fn', (ev, { type, args }) => this.handlerList[type](...args));
  }

  sendMsg(channel, msgBody) {
    this.sender.send(channel, msgBody);
  }

  sendToClient(type, data) {
    this.sendMsg('ipc-reply', {
      type,
      data,
    });
  }
}
