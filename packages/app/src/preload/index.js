import {
  contextBridge,
  ipcRenderer,
} from 'electron';
import * as ipcType from '@pkg/share/utils/ipcConstant';

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
        if (channel === 'ipc-fn') {
          if (!result.err) {
            return result.data;
          }
          throw new Error(result.err);
        }
        return result;
      }
      throw new Error(`ipc invoke: 信号 [${channel}] 不在白名单`);
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

    const detach = (type) => {
      const idx = callbackCache.findIndex((v) => v.type === type);
      if (idx > -1) {
        callbackCache.splice(idx, 1);
      }
    };

    const on = (type, callback) => {
      detach(type);
      callbackCache.push({
        type,
        callback,
      });
    };

    const invoke = (fnType, ...fnArgs) => api.ipcRenderer.invoke('ipc-fn', {
      type: fnType,
      args: fnArgs,
    });

    return {
      send,
      on,
      invoke,
      detach,
    };
  },
  dialog: {
    showOpenDialog: (...args) => api.useIpc().invoke(ipcType.DIALOG_SHOW_OPEN_DIALOG, ...args),
    showSaveDialog: (...args) => api.useIpc().invoke(ipcType.DIALOG_SHOW_SAVE_DIALOG, ...args),
    showMessageBox: (...args) => api.useIpc().invoke(ipcType.DIALOG_SHOW_MESSAGE_BOX, ...args),
    showErrorBox: (...args) => api.useIpc().invoke(ipcType.DIALOG_SHOW_ERROR_BOX, ...args),
    showCertificateTrustDialog: (...args) => api.useIpc().invoke(ipcType.DIALOG_SHOW_CERTIFICATE_TRUST_DIALOG, ...args),
  },
  notification: {
    show: (...args) => api.useIpc().invoke(ipcType.SHOW_NOTIFICATION, ...args),
    isSupported: () => api.useIpc().invoke(ipcType.IS_NOTIFICATION_SUPPORTED),
  },
  openLink: (...args) => api.useIpc().invoke(ipcType.OPEN_LINK, ...args),
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
contextBridge.exposeInMainWorld(apiKey, api);
api.useIpc().invoke(ipcType.GET_PATH, 'userData').then((result) => {
  api.APPDATA_PATH = result;
});

function createLoggerBase(defaultMeta = {}) {
  return {
    log: (...args) => api.useIpc().invoke(ipcType.LOGGER, 'log', { args, meta: defaultMeta }),
    error: (...args) => api.useIpc().invoke(ipcType.LOGGER, 'error', { args, meta: defaultMeta }),
    warn: (...args) => api.useIpc().invoke(ipcType.LOGGER, 'warn', { args, meta: defaultMeta }),
    info: (...args) => api.useIpc().invoke(ipcType.LOGGER, 'info', { args, meta: defaultMeta }),
    debug: (...args) => api.useIpc().invoke(ipcType.LOGGER, 'debug', { args, meta: defaultMeta }),
    child: (childMeta) => createLoggerBase({ ...defaultMeta, ...childMeta }),
  };
}
const translime = {
  net: {
    request: (requestId, config) => api.useIpc().invoke(ipcType.NET_REQUEST, { requestId, config }),
    abort: (requestId) => api.useIpc().invoke(ipcType.NET_ABORT, { requestId }),
  },
  // winston logger
  logger: createLoggerBase(),
};

// 快捷接口
// 获取插件设置
const getPluginSetting = async (...args) => api.useIpc().invoke(ipcType.GET_PLUGIN_SETTING, ...args);
translime.getPluginSetting = getPluginSetting;

// 设置插件设置
const setPluginSetting = async (...args) => api.useIpc().invoke(ipcType.SET_PLUGIN_SETTING, ...args);
translime.setPluginSetting = setPluginSetting;

const executePluginCommand = async (...args) => api.useIpc().invoke(
  ipcType.EXECUTE_PLUGIN_COMMAND,
  ...args,
);
translime.executePluginCommand = executePluginCommand;

// 窗口控制
const windowControl = {
  devtools: (win) => api.useIpc().invoke(ipcType.DEVTOOLS, win),
  maximize: (win) => api.useIpc().invoke(ipcType.APP_MAXIMIZE, win),
  unmaximize: (win) => api.useIpc().invoke(ipcType.APP_UNMAXIMIZE, win),
  minimize: (win) => api.useIpc().invoke(ipcType.APP_MINIMIZE, win),
  close: (win) => api.useIpc().invoke(ipcType.APP_CLOSE, win),
};
translime.windowControl = windowControl;

const loadPluginUi = async (pluginPath, type = 'text/javascript') => {
  const ui = await api.useIpc().invoke(ipcType.LOAD_PLUGIN_UI, pluginPath);
  if (!type || type === true) {
    return ui;
  }
  return new Blob([ui], { type });
};
translime.loadPluginUi = loadPluginUi;
contextBridge.exposeInMainWorld('ts', translime);
