import { ref, reactive } from 'vue';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc, useDialog } from '@/hooks/electron';

const ipc = useIpc();
const ipcRaw = useIpc(false);

export const showTextEditContextMenu = () => {
  const selectedText = window.getSelection().toString();
  ipc.send(ipcType.SHOW_TEXT_EDIT_CONTEXT, { selectedText });
};

export const useState = (initialValue) => {
  if (typeof initialValue === 'object') {
    const state = reactive(initialValue);
    const setValue = (newValue) => {
      if (typeof newValue === 'function') {
        newValue(state);
      } else {
        Object.entries(newValue).forEach(([key, val]) => {
          state[key] = val;
        });
      }
    };
    return [state, setValue];
  }
  const state = ref(initialValue);
  const setValue = (newValue) => {
    if (typeof newValue === 'function') {
      state.value = newValue(state.value);
    } else {
      state.value = newValue;
    }
  };
  return [state, setValue];
};

export const appConfigStore = new Proxy({}, {
  get(t, prop) {
    return (...args) => ipcRaw.invoke('appConfigStore', prop, ...args);
  },
});

export const selectFileDialog = (win, options = {}) => {
  const dialog = useDialog();
  return dialog.showOpenDialog(win, {
    properties: ['openFile', 'dontAddToRecent'],
    ...options,
  });
};

export const openPluginWindow = (plugin, dark = false, appSetting = {}) => {
  const url = plugin.windowUrl
    ? plugin.windowUrl
    : `plugin-index.html?pluginId=${plugin.packageName}&dark=${dark}&app-setting=${btoa(JSON.stringify(appSetting))}`;
  const options = JSON.parse(JSON.stringify(plugin.windowOptions));
  delete options.windowUrl;
  if (process.env.NODE_ENV === 'development') {
    console.log('plugin window url: ', url);
    console.log('plugin window options: ', options);
    window.ts.logger.debug(`plugin window url: ${url}`);
    window.ts.logger.debug('plugin window options: ', { options });
  }
  ipc.send(ipcType.OPEN_NEW_WINDOW, {
    name: `plugin-window-${plugin.packageName}`,
    options: {
      windowUrl: url,
      appMenu: null,
      frame: true,
      titleBarStyle: appSetting?.useNativeTitleBar ? 'default' : 'hidden',
      title: plugin.title,
      ...options,
    },
  });
};
