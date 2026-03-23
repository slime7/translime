/**
 * Translime SDK
 * 提供插件开发所需的标准 API 和类型提示。
 * 包含主进程 (Main Process) 和渲染进程 (Renderer Process) 的通用接口。
 */

import {
  isPreviewMode as checkPreviewMode,
  initPreviewMock,
} from './preview-mock';
import electronNetAdapter from './electronNetAdapter';

// ----------------------------------------------------------------------
// Initialization (Side Effect)
// ----------------------------------------------------------------------

// 在模块加载时检测并初始化 Preview Mock 环境
// 确保在 Preview 模式下直接导入 SDK 也能获得 Mock 支持
if (typeof window !== 'undefined' && checkPreviewMode()) {
  initPreviewMock();
}

// ----------------------------------------------------------------------
// Core / Store APIs (Main Process Only)
// ----------------------------------------------------------------------

/**
 * 检查当前是否为 Preview 模式
 * @returns {boolean}
 */
export function isPreviewMode() {
  return checkPreviewMode();
}

/**
 * @typedef {Object} MainStore
 * @property {Object} config
 * @property {function(string, *): *} config.get
 * @property {function(string, *): void} config.set
 * @property {Object} [logger]
 */

/**
 * 获取主程序 Store
 * @description 仅在 **主进程 (Main Process)** 环境可用
 * @returns {MainStore|null} 若在非主进程环境调用，返回 null
 */
export function getMainStore() {
  if (typeof global !== 'undefined' && global.mainStore) {
    return global.mainStore;
  }
  return null;
}

/**
 * 使用插件配置代理
 * @description 获取针对特定插件的配置读写对象
 * @param {string} pluginId 插件 ID (通常与 package.json 中的 name 一致)
 * @returns {{ get: function(string, *): *, set: function(string, *): void }}
 */
export function usePluginConfig(pluginId) {
  const store = getMainStore();
  return {
    get(key, defaultValue) {
      return store?.config?.get(`plugin.${pluginId}.settings.${key}`, defaultValue);
    },
    set(key, value) {
      store?.config?.set(`plugin.${pluginId}.settings.${key}`, value);
    },
  };
}

/**
 * 获取插件间通信工具
 * @description 仅在 **主进程 (Main Process)** 环境可用
 * @returns {import('./index.d').PluginInterop|null}
 */
export function usePluginInterop() {
  if (typeof global !== 'undefined' && global.pluginInterop) {
    return global.pluginInterop;
  }
  return null;
}

// ----------------------------------------------------------------------
// UI & Renderer APIs (Renderer Process Only)
// ----------------------------------------------------------------------

/**
 * 获取 IPC 通信工具
 * @description 仅在 **渲染进程 (Renderer Process)** 环境可用
 * @returns {Object|null} 包含 invoke, send, on 等方法的对象
 */
export function useIpc() {
  if (typeof window !== 'undefined' && window.electron?.useIpc) {
    return window.electron.useIpc();
  }
  return null;
}

/**
 * 获取 Vuetify 实例
 * @description 仅在 **渲染进程** 环境可用，用于访问 Vuetify 的全局配置
 * @returns {Object} Vuetify 实例对象
 */
export function useVuetify() {
  if (typeof window !== 'undefined' && window.vuetify$) {
    return window.vuetify$;
  }
  return {};
}

/**
 * 获取全局注册的 Vuetify 组件
 * @returns {Record<string, any>}
 */
export function useVuetifyComponents() {
  return useVuetify().components || {};
}

/**
 * 获取全局注册的 Vuetify 指令
 * @returns {Record<string, any>}
 */
export function useVuetifyDirectives() {
  return useVuetify().directives || {};
}

/**
 * 获取 Dialog API
 * @description 类似于 Electron 的 dialog 模块 (showOpenDialog, showSaveDialog 等)
 * @returns {Object|null}
 */
export function useDialog() {
  if (typeof window !== 'undefined' && window.electron?.dialog) {
    return window.electron.dialog;
  }
  return null;
}

/**
 * 获取 Shell API
 * @description 类似于 Electron 的 shell 模块 (openExternal, showItemInFolder 等)
 * @returns {Object|null}
 */
export function useShell() {
  if (typeof window !== 'undefined' && window.electron?.shell) {
    return window.electron.shell;
  }
  return null;
}

/**
 * 获取插件自身设置 (IPC 封装)
 * @description 仅在 **渲染进程** 环境可用。这是 `plugin.settings` 的前端读取接口。
 * @param {...any} args
 * @returns {Promise<any>}
 */
export async function getPluginSetting(...args) {
  if (typeof window !== 'undefined' && window.ts?.getPluginSetting) {
    return window.ts.getPluginSetting(...args);
  }
  return null;
}

/**
 * 更新插件自身设置 (IPC 封装)
 * @description 仅在 **渲染进程** 环境可用。
 * @param {...any} args
 * @returns {Promise<any>}
 */
export async function setPluginSetting(...args) {
  if (typeof window !== 'undefined' && window.ts?.setPluginSetting) {
    return window.ts.setPluginSetting(...args);
  }
  return null;
}

/**
 * 获取窗口控制工具
 * @description 包含 minimize, maximize, close 等窗口操作
 * @returns {Object|null}
 */
export function useWindowControl() {
  if (typeof window !== 'undefined' && window.ts?.windowControl) {
    return window.ts.windowControl;
  }
  return null;
}

// ----------------------------------------------------------------------
// Utilities (Shared)
// ----------------------------------------------------------------------

/**
 * 获取剪贴板工具
 * @returns {Object|null}
 */
export function useClipboard() {
  if (typeof window !== 'undefined' && window.electron?.clipboard) {
    return window.electron.clipboard;
  }
  return null;
}

/**
 * 在默认浏览器中打开链接
 * @param {string} url 要打开的链接
 * @returns {Promise<void>}
 */
export async function openLink(...args) {
  if (typeof window !== 'undefined' && window.electron?.openLink) {
    return window.electron.openLink(...args);
  }
  return null;
}

/**
 * 获取日志工具
 * @description 自动适配 Node.js 环境 (Main) 或浏览器环境 (Renderer)
 * @returns {Record<'log'|'info'|'warn'|'error'|'debug', Function>} Console-like logger
 */
export function useLogger() {
  if (typeof global !== 'undefined' && global.mainStore) {
    return global.mainStore?.logger || console;
  }
  if (typeof window !== 'undefined') {
    return window.ts?.logger || console;
  }
  return console;
}

export { electronNetAdapter };
