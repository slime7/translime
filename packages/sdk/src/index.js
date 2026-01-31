/**
 * Translime SDK
 * 提供插件开发所需的标准 API 和类型提示
 */

import {
  isPreviewMode as checkPreviewMode,
  initPreviewMock,
} from './preview-mock.js';

// 在模块加载时自动检测并初始化 preview 模式
// 这样插件代码无需任何修改即可在 preview 模式下运行
if (typeof window !== 'undefined' && checkPreviewMode()) {
  initPreviewMock();
}

/**
 * 检查当前是否为 preview 模式
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
 */

/**
 * 获取主程序 Store (仅在主进程环境可用)
 * @returns {MainStore|null}
 */
export function getMainStore() {
  if (typeof global !== 'undefined' && global.mainStore) {
    return global.mainStore;
  }
  return null;
}

/**
 * 获取插件配置代理
 * @param {string} pluginId 插件 ID
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
 * 获取 IPC 工具 (仅在渲染进程环境可用)
 * @returns {Object}
 */
export function useIpc() {
  if (typeof window !== 'undefined' && window.electron?.useIpc) {
    return window.electron.useIpc();
  }
  return null;
}

/**
 * 获取 Vuetify 实例和组件 (仅在渲染进程环境可用)
 * @returns {Object}
 */
export function useVuetify() {
  if (typeof window !== 'undefined' && window.vuetify$) {
    return window.vuetify$;
  }
  return {};
}

/**
 * 获取 Vuetify 组件
 * @returns {Record<string, any>}
 */
export function useVuetifyComponents() {
  return useVuetify().components || {};
}

/**
 * 获取 Vuetify 指令
 * @returns {Record<string, any>}
 */
export function useVuetifyDirectives() {
  return useVuetify().directives || {};
}

/**
 * 助手函数：获取 Electron 提供的对话框 API
 * @returns {Object}
 */
export function useDialog() {
  if (typeof window !== 'undefined' && window.electron?.dialog) {
    return window.electron.dialog;
  }
  return null;
}

/**
 * 助手函数：获取 Shell API
 * @returns {Object}
 */
export function useShell() {
  if (typeof window !== 'undefined' && window.electron?.shell) {
    return window.electron.shell;
  }
  return null;
}

/**
 * 获取插件设置 (仅在渲染进程环境可用)
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
 * 设置插件设置 (仅在渲染进程环境可用)
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
 * 获取窗口控制工具 (仅在渲染进程环境可用)
 * @returns {Object}
 */
export function useWindowControl() {
  if (typeof window !== 'undefined' && window.ts?.windowControl) {
    return window.ts.windowControl;
  }
  return null;
}

/**
 * 获取剪贴板工具 (仅在渲染进程环境可用)
 * @returns {Object}
 */
export function useClipboard() {
  if (typeof window !== 'undefined' && window.electron?.clipboard) {
    return window.electron.clipboard;
  }
  return null;
}

/**
 * 在浏览器中打开链接 (仅在渲染进程环境可用)
 * @param {...any} args
 * @returns {Promise<any>}
 */
export async function openLink(...args) {
  if (typeof window !== 'undefined' && window.electron?.openLink) {
    return window.electron.openLink(...args);
  }
  return null;
}

/**
 * 获取日志工具 (多端适配)
 * @returns {Record<'log'|'info'|'warn'|'error'|'debug', Function>}
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
