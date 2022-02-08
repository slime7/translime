import { contextBridge, ipcRenderer } from 'electron';

const apiKey = 'electron';
const ipcWhiteList = {
  send: [
    'ipc-msg',
    'main-renderer-ready',
  ],
  receive: [
    'ipc-reply',
  ],
  invoke: [
    'appConfigStore',
    'ipc-fn',
  ],
};
/**
 * @see https://github.com/electron/electron/issues/21437#issuecomment-573522360
 */
const api = {
  versions: process.versions,
  ipcRenderer: {
    send: (channel, data) => {
      // whitelist channels
      const validChannels = ipcWhiteList.send;
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      } else {
        console.log('ipc send: 信号不在白名单');
      }
    },
    receive: (channel, func) => {
      const validChannels = ipcWhiteList.receive;
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender`
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      } else {
        console.log('ipc receive: 信号不在白名单');
      }
    },
    invoke: async (channel, ...data) => {
      const validChannels = ipcWhiteList.invoke;
      if (validChannels.includes(channel)) {
        const result = await ipcRenderer.invoke(channel, ...data);
        if (!result.err) {
          return Promise.resolve(result.data);
        }
        return Promise.reject(new Error(result.err));
      }
      return Promise.reject(new Error('ipc invoke: 信号不在白名单'));
    },
  },
};

/**
 * The "Main World" is the JavaScript context that your main renderer code runs in.
 * By default, the page you load in your renderer executes code in this world.
 *
 * @see https://www.electronjs.org/docs/api/context-bridge
 */
contextBridge.exposeInMainWorld(apiKey, api);
ipcRenderer.invoke('ipc-fn', {
  type: 'get-path',
  args: ['userData'],
}).then((path) => {
  contextBridge.exposeInMainWorld('APPDATA_PATH', path);
});
