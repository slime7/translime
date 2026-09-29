import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * IPC 请求上下文。
 *
 * 独立模块保存 AsyncLocalStorage 实例，让 handler 侧（ipcHandler 及其子模块）
 * 能读取当前请求的 sender，而无需与 `Ipc` 类互相 import。
 */
const ipcContext = new AsyncLocalStorage();

/**
 * 获取当前 IPC 请求的 sender（`WebContents`），非 IPC 调用路径返回 `null`。
 *
 * @returns {import('electron').WebContents|null}
 */
export const getIpcSender = () => ipcContext.getStore() || null;

export default ipcContext;
