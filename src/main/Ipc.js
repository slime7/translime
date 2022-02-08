import ipcHandler from '@pkg/main/utils/ipcHandler';

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
