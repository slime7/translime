import { contextBridge, ipcRenderer } from 'electron';

const PLUGIN_ID = 'translime-plugin-scrcpy-wrapper';
const MEDIA_CHANNEL = `scrcpy-media@${PLUGIN_ID}`;

contextBridge.exposeInMainWorld('scrcpyWrapper', {
  /**
   * 发送控制消息（触摸/滚轮/按键/剪贴板等），经宿主 ipc-fn 通道到插件主进程
   */
  sendInput: (sessionId, message) => ipcRenderer.invoke('ipc-fn', {
    type: `scrcpy-input@${PLUGIN_ID}`,
    args: [sessionId, message],
  }),
  /**
   * 订阅主进程推送的媒体/状态事件，返回取消订阅函数
   */
  onMedia: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(MEDIA_CHANNEL, listener);
    return () => ipcRenderer.removeListener(MEDIA_CHANNEL, listener);
  },
});
