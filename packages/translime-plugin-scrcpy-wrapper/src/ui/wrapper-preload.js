import { contextBridge, ipcRenderer } from 'electron';

const PLUGIN_ID = 'translime-plugin-scrcpy-wrapper';

contextBridge.exposeInMainWorld('scrcpyWrapper', {
  sendKey: (sessionId, keycode) => ipcRenderer.invoke('ipc-fn', {
    type: `scrcpy-key@${PLUGIN_ID}`,
    args: [sessionId, keycode],
  }),
  // 拖动调整窗口尺寸期间主进程推送冻结帧（dataURL）与撤帧通知
  onFreezeFrame: (callback) => {
    ipcRenderer.on(`scrcpy-freeze@${PLUGIN_ID}`, (_event, frame) => callback(frame));
  },
  onFreezeEnd: (callback) => {
    ipcRenderer.on(`scrcpy-unfreeze@${PLUGIN_ID}`, () => callback());
  },
});
