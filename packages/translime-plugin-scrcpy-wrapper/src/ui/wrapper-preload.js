import { contextBridge, ipcRenderer } from 'electron';

const PLUGIN_ID = 'translime-plugin-scrcpy-wrapper';

contextBridge.exposeInMainWorld('scrcpyWrapper', {
  sendKey: (sessionId, keycode) => ipcRenderer.invoke('ipc-fn', {
    type: `scrcpy-key@${PLUGIN_ID}`,
    args: [sessionId, keycode],
  }),
});
