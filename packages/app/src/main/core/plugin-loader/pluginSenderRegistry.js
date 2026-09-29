/**
 * 插件渲染端归属登记表。
 *
 * 插件 UI 都运行在加载了宿主 preload 的 webview / 独立窗口中，主进程通过
 * 两条途径把 WebContents 归属到具体插件：
 * 1. 显式登记：`load-plugin-ui` 由插件 UI 文档（PluginRender 所在 webview）发起，
 *    主进程根据请求的 UI 产物路径匹配插件并登记发起方；
 * 2. 宿主推断：独立插件窗口（`plugin-window-<pkg>`）内的 webview guest
 *    通过 `hostWebContents` 关联到窗口，再由窗口名解析插件。
 *
 * 归属结果只用于 IPC 收口（跨插件调用校验、设置读写限定自身），
 * 未登记的发送方一律视为主机侧（宿主 UI / 宿主窗口），保持放行。
 */

/**
 * @type {Map<number, string>} webContents.id -> 插件包名
 */
const senderOwners = new Map();

/**
 * 登记一个 WebContents 的归属插件。
 *
 * @param {import('electron').WebContents} webContents - 发起方 WebContents。
 * @param {string} pluginId - 插件包名。
 * @returns {void}
 */
const attributeSender = (webContents, pluginId) => {
  if (!webContents || !pluginId) {
    return;
  }
  if (typeof webContents.isDestroyed === 'function' && webContents.isDestroyed()) {
    return;
  }
  senderOwners.set(webContents.id, pluginId);
  if (typeof webContents.once === 'function') {
    webContents.once('destroyed', () => {
      senderOwners.delete(webContents.id);
    });
  }
};

/**
 * 解析发送方所属插件。
 *
 * @param {import('electron').WebContents} sender - IPC 发送方。
 * @returns {string|null} 插件包名；主机侧发送方返回 `null`。
 */
const resolveSenderPluginId = (sender) => {
  if (!sender) {
    return null;
  }
  if (typeof sender.isDestroyed === 'function' && sender.isDestroyed()) {
    return null;
  }
  const explicit = senderOwners.get(sender.id);
  if (explicit) {
    return explicit;
  }
  // 独立插件窗口内的 webview guest：经由宿主窗口推断归属
  const hostContents = sender.hostWebContents;
  if (hostContents && !(typeof hostContents.isDestroyed === 'function' && hostContents.isDestroyed())) {
    return senderOwners.get(hostContents.id) || null;
  }
  return null;
};

/**
 * 移除指定 WebContents 的归属登记（销毁兜底，一般由 destroyed 事件自动触发）。
 *
 * @param {number} webContentsId - WebContents id。
 * @returns {void}
 */
const removeSender = (webContentsId) => {
  senderOwners.delete(webContentsId);
};

export {
  attributeSender,
  removeSender,
  resolveSenderPluginId,
};
