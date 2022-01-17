const { ipcRenderer } = window.electron;

const ipcService = Object.create(null);
const callbackCache = [];

ipcService.install = (Vue) => {
  /* eslint-disable-next-line no-param-reassign */
  Vue.prototype.$ipcRenderer = {
    send: (msgType, msgData) => {
      ipcRenderer.send('ipc-msg', {
        type: msgType,
        data: msgData,
      });
    },
    on: (type, callback) => {
      callbackCache.push({
        type,
        callback,
      });
    },
    invoke: (fnType, ...fnArgs) => ipcRenderer.invoke('ipc-fn', {
      type: fnType,
      args: fnArgs,
    }),
    detach: (type) => {
      const idx = callbackCache.findIndex((v) => v.type === type);
      if (idx > -1) {
        callbackCache.splice(idx, 1);
      } else {
        // eslint-disable-next-line no-console
        console.error(`error type ${type}`);
      }
    },
  };
  ipcRenderer.receive('ipc-reply', (msg) => {
    callbackCache.forEach((cache) => {
      if (cache.type === msg.type && cache.callback) {
        cache.callback(msg.data);
      }
    });
  });
};

export default ipcService;
