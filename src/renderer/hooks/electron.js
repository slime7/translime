const {
  clipboard,
  ipcRenderer,
  dialog,
  notification,
} = window.electron;

export const useClipboard = () => clipboard;

export const useDialog = () => dialog;

export const useNotify = () => notification;

const callbackCache = [];
ipcRenderer.receive('ipc-reply', (msg) => {
  console.log(`ipc-reply by ${msg.type}`, msg);
  callbackCache.forEach((cache) => {
    if (cache.type === msg.type && cache.callback) {
      cache.callback(msg.data);
    }
  });
});
export const useIpc = (wrapped = true) => {
  // 返回未包装的 ipcRenderer
  if (!wrapped) {
    return ipcRenderer;
  }

  const send = (msgType, msgData) => {
    ipcRenderer.send('ipc-msg', {
      type: msgType,
      data: msgData,
    });
  };

  const on = (type, callback) => {
    if (callbackCache.find((cache) => cache.type === type)) {
      return;
    }
    callbackCache.push({
      type,
      callback,
    });
  };

  const invoke = (fnType, ...fnArgs) => ipcRenderer.invoke('ipc-fn', {
    type: fnType,
    args: fnArgs,
  });

  const detach = (type) => {
    const idx = callbackCache.findIndex((v) => v.type === type);
    if (idx > -1) {
      callbackCache.splice(idx, 1);
    } else {
      console.error(`error type ${type}`);
    }
  };

  return {
    send,
    on,
    invoke,
    detach,
    callbackCache,
  };
};
