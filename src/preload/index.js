import { contextBridge, clipboard, ipcRenderer } from 'electron';
import path from 'path';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import fs from 'fs';

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
  clipboard,
  dialog: {
    showOpenDialog: (...args) => ipcRenderer.invoke('ipc-fn', {
      type: ipcType.DIALOG_SHOW_OPEN_DIALOG,
      args,
    }),
    showSaveDialog: (...args) => ipcRenderer.invoke('ipc-fn', {
      type: ipcType.DIALOG_SHOW_SAVE_DIALOG,
      args,
    }),
    showMessageBox: (...args) => ipcRenderer.invoke('ipc-fn', {
      type: ipcType.DIALOG_SHOW_MESSAGE_BOX,
      args,
    }),
    showErrorBox: (...args) => ipcRenderer.invoke('ipc-fn', {
      type: ipcType.DIALOG_SHOW_ERROR_BOX,
      args,
    }),
    showCertificateTrustDialog: (...args) => ipcRenderer.invoke('ipc-fn', {
      type: ipcType.DIALOG_SHOW_CERTIFICATE_TRUST_DIALOG,
      args,
    }),
  },
  APP_ROOT: path.resolve(__dirname, '../'),
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
}).then((result) => {
  contextBridge.exposeInMainWorld('APPDATA_PATH', result.data);
});

// 快捷接口
// 获取插件设置
const getPluginSetting = async (...args) => {
  const result = await ipcRenderer.invoke('ipc-fn', {
    type: ipcType.GET_PLUGIN_SETTING,
    args,
  });
  if (!result.err) {
    return Promise.resolve(result.data);
  }
  return Promise.reject(new Error(result.err));
};
contextBridge.exposeInMainWorld('getPluginSetting', getPluginSetting);

// 设置插件设置
const setPluginSetting = async (...args) => {
  const result = await ipcRenderer.invoke('ipc-fn', {
    type: ipcType.SET_PLUGIN_SETTING,
    args,
  });
  if (!result.err) {
    return Promise.resolve(result.data);
  }
  return Promise.reject(new Error(result.err));
};
contextBridge.exposeInMainWorld('setPluginSetting', setPluginSetting);

// 窗口控制
const windowControl = {
  devtools: (win) => ipcRenderer.send('ipc-msg', {
    type: ipcType.DEVTOOLS,
    data: win,
  }),
  maximize: (win) => ipcRenderer.send('ipc-msg', {
    type: ipcType.APP_MAXIMIZE,
    data: win,
  }),
  unmaximize: (win) => ipcRenderer.send('ipc-msg', {
    type: ipcType.APP_UNMAXIMIZE,
    data: win,
  }),
  minimize: (win) => ipcRenderer.send('ipc-msg', {
    type: ipcType.APP_MINIMIZE,
    data: win,
  }),
  close: (win) => ipcRenderer.send('ipc-msg', {
    type: ipcType.APP_CLOSE,
    data: win,
  }),
};
contextBridge.exposeInMainWorld('windowControl', windowControl);

// eslint-disable-next-line global-require,import/no-dynamic-require
const loadPluginUi = (pluginPath) => {
  const ui = fs.readFileSync(pluginPath, 'utf8');
  return new Blob([ui], { type: 'text/javascript' });
};
contextBridge.exposeInMainWorld('loadPluginUi', loadPluginUi);
