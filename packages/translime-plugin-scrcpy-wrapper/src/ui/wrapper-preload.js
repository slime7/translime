import { contextBridge, ipcRenderer } from 'electron';

const PLUGIN_ID = 'translime-plugin-scrcpy-wrapper';

contextBridge.exposeInMainWorld('scrcpyWrapper', {
  sendKey: (sessionId, keycode) => ipcRenderer.invoke('ipc-fn', {
    type: `scrcpy-key@${PLUGIN_ID}`,
    args: [sessionId, keycode],
  }),
  openInNewWindow: (sessionId) => ipcRenderer.invoke('ipc-fn', {
    type: `open-in-new-window@${PLUGIN_ID}`,
    args: [sessionId],
  }),
  toggleScreen: (sessionId) => ipcRenderer.invoke('ipc-fn', {
    type: `toggle-screen@${PLUGIN_ID}`,
    args: [sessionId],
  }),
  rotateDevice: (sessionId) => ipcRenderer.invoke('ipc-fn', {
    type: `rotate-device@${PLUGIN_ID}`,
    args: [sessionId],
  }),
  windowControl: {
    minimize: () => {
      ipcRenderer.send(`scrcpy-window-control@${PLUGIN_ID}`, 'minimize');
    },
    close: () => {
      ipcRenderer.send(`scrcpy-window-control@${PLUGIN_ID}`, 'close');
    },
  },
  // 拖动调整窗口尺寸期间主进程推送冻结帧（dataURL）与撤帧通知
  onFreezeFrame: (callback) => {
    ipcRenderer.on(`scrcpy-freeze@${PLUGIN_ID}`, (_event, frame) => {
      callback(frame);
    });
  },
  onFreezeEnd: (callback) => {
    ipcRenderer.on(`scrcpy-unfreeze@${PLUGIN_ID}`, () => {
      callback();
    });
  },
  // 鼠标靠近/远离通知
  onChromeVisible: (callback) => {
    ipcRenderer.on(`scrcpy-chrome-visible@${PLUGIN_ID}`, (_event, visible) => {
      callback(visible);
    });
  },
  // SDL 实际位置与圆角矩形通知（CSS 像素）
  onSdlRect: (callback) => {
    ipcRenderer.on(`scrcpy-sdl-rect@${PLUGIN_ID}`, (_event, rect) => {
      callback(rect);
    });
  },
  // 前台应用状态通知（排除桌面启动器）
  onForegroundApp: (callback) => {
    ipcRenderer.on(`scrcpy-foreground-app@${PLUGIN_ID}`, (_event, info) => {
      callback(info);
    });
  },
});
