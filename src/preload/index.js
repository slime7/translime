import {
  contextBridge,
  clipboard,
  ipcRenderer,
} from 'electron';
import path from 'path';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import fs from 'fs';
// import axiosHttpAdapter from 'axios/lib/adapters/http';

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
const callbackCache = [];
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
  useIpc: (wrapped = true) => {
    // 返回未包装的 ipcRenderer
    if (!wrapped) {
      return api.ipcRenderer;
    }

    const send = (msgType, msgData) => {
      api.ipcRenderer.send('ipc-msg', {
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

    const invoke = (fnType, ...fnArgs) => api.ipcRenderer.invoke('ipc-fn', {
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
  notification: {
    show: (...args) => ipcRenderer.invoke('ipc-fn', {
      type: ipcType.SHOW_NOTIFICATION,
      args,
    }),
    isSupported: () => ipcRenderer.invoke('ipc-fn', {
      type: ipcType.IS_NOTIFICATION_SUPPORTED,
    }),
  },
  APP_ROOT: path.resolve(__dirname, '../'),
  // axiosHttpAdapter,
};
api.ipcRenderer.receive('ipc-reply', (msg) => {
  console.log(`ipc-reply by ${msg.type}`, msg);
  callbackCache.forEach((cache) => {
    if (cache.type === msg.type && cache.callback) {
      cache.callback(msg.data);
    }
  });
});

/**
 * The "Main World" is the JavaScript context that your main renderer code runs in.
 * By default, the page you load in your renderer executes code in this world.
 *
 * @see https://www.electronjs.org/docs/api/context-bridge
 */
ipcRenderer.invoke('ipc-fn', {
  type: 'get-path',
  args: ['userData'],
}).then((result) => {
  api.APPDATA_PATH = result.data;
  contextBridge.exposeInMainWorld(apiKey, api);
});

const translime = {};
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
translime.getPluginSetting = getPluginSetting;

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
translime.setPluginSetting = setPluginSetting;

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
translime.windowControl = windowControl;

const loadPluginUi = (pluginPath, type = 'text/javascript') => {
  const ui = fs.readFileSync(pluginPath, 'utf8');
  if (!type || type === true) {
    return ui;
  }
  return new Blob([ui], { type });
};
translime.loadPluginUi = loadPluginUi;
contextBridge.exposeInMainWorld('ts', translime);
