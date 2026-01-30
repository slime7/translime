/**
 * HDR 截图工具 - Overlay Preload 脚本
 *
 * 在渲染进程中暴露安全的 IPC 接口
 */

import { contextBridge, ipcRenderer } from 'electron';

const PLUGIN_ID = 'translime-plugin-hdr-capture';

const translime = {
  /**
   * 日志记录
   */
  logger: createLoggerBase(),
};

function createLoggerBase(defaultMeta = {}) {
  return {
    log: (...args) => ipcRenderer.invoke('ipc-fn', { type: 'logger', args: ['log', { args, meta: defaultMeta }] }),
    error: (...args) => ipcRenderer.invoke('ipc-fn', { type: 'logger', args: ['error', { args, meta: defaultMeta }] }),
    warn: (...args) => ipcRenderer.invoke('ipc-fn', { type: 'logger', args: ['warn', { args, meta: defaultMeta }] }),
    info: (...args) => ipcRenderer.invoke('ipc-fn', { type: 'logger', args: ['info', { args, meta: defaultMeta }] }),
    debug: (...args) => ipcRenderer.invoke('ipc-fn', { type: 'logger', args: ['debug', { args, meta: defaultMeta }] }),
    child: (childMeta) => createLoggerBase({ ...defaultMeta, ...childMeta }),
  };
}

contextBridge.exposeInMainWorld('ts', translime);
contextBridge.exposeInMainWorld('hdrCapture', {
  /**
   * 获取指定坐标处的窗口信息
   * @param {number} x
   * @param {number} y
   * @returns {Promise<WindowInfo|null>}
   */
  getWindowAtPoint: (x, y) => ipcRenderer.invoke('ipc-fn', { type: `get-window-at-point@${PLUGIN_ID}`, args: [x, y] }),

  /**
   * 获取所有顶层窗口
   * @returns {Promise<WindowInfo[]>}
   */
  getTopLevelWindows: () => ipcRenderer.invoke('ipc-fn', { type: `get-top-level-windows@${PLUGIN_ID}`, args: [] }),

  /**
   * 保存截图
   * @param {Rect} rect - 选区矩形
   * @returns {Promise<void>}
   */
  saveCapture: (rect) => ipcRenderer.invoke('ipc-fn', { type: `save-capture@${PLUGIN_ID}`, args: [rect] }),

  /**
   * 复制截图到剪贴板
   * @param {Rect} rect - 选区矩形
   * @returns {Promise<void>}
   */
  copyCapture: (rect) => ipcRenderer.invoke('ipc-fn', { type: `copy-capture@${PLUGIN_ID}`, args: [rect] }),

  /**
   * 关闭叠加层
   */
  close: () => ipcRenderer.send('ipc-msg', { type: `close-overlay@${PLUGIN_ID}` }),

  /**
   * 监听初始化消息
   * @param {function} callback
   */
  onInit: (callback) => {
    ipcRenderer.on(`overlay-init@${PLUGIN_ID}`, (event, data) => callback(data));
  },
});
