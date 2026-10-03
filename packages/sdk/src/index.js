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

const CLIPBOARD_IPC = {
  readText: 'read-clipboard-text',
  writeText: 'copy-text',
};

// ----------------------------------------------------------------------
// Initialization (Side Effect)
// ----------------------------------------------------------------------

// 在模块加载时检测并初始化 Preview Mock 环境
// 确保在 Preview 模式下直接导入 SDK 也能获得 Mock 支持
if (typeof window !== 'undefined' && checkPreviewMode()) {
  initPreviewMock();
}

// ----------------------------------------------------------------------
// Isolated Mode Detection (utilityProcess Child)
// ----------------------------------------------------------------------

/**
 * 当前是否运行在宿主的隔离插件子进程（plugin.isolated: true）中。
 * @returns {boolean}
 */
export function isIsolatedMode() {
  return typeof process !== 'undefined'
    && process.env
    && process.env.TRANSLIME_ISOLATED_PLUGIN;
}

const isolatedUnsupported = (apiName) => {
  throw new Error(
    `SDK API "${apiName}" 在隔离模式（plugin.isolated: true）下不可用：`
    + '隔离插件的宿主侧桥接暂不包含全局 Store / 插件间 interop，'
    + '请改用 IPC handler 与宿主通信，或去掉 manifest 中的 isolated 声明。',
  );
};

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
 * @description 仅在 **主进程 (Main Process)** 环境可用；隔离模式（plugin.isolated）下抛错
 * @returns {MainStore|null} 若在非主进程环境调用，返回 null
 */
export function getMainStore() {
  if (isIsolatedMode()) {
    isolatedUnsupported('getMainStore');
  }
  if (typeof global !== 'undefined' && global.mainStore) {
    return global.mainStore;
  }
  return null;
}

/**
 * 使用插件配置代理
 * @description 获取针对特定插件的配置读写对象；隔离模式（plugin.isolated）下抛错
 * @param {string} pluginId 插件 ID (通常与 package.json 中的 name 一致)
 * @returns {{ get: function(string, *): *, set: function(string, *): void }}
 */
export function usePluginConfig(pluginId) {
  if (isIsolatedMode()) {
    isolatedUnsupported('usePluginConfig');
  }
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
 * @description 仅在 **主进程 (Main Process)** 环境可用；隔离模式（plugin.isolated）下抛错
 * @returns {import('./index.d').PluginInterop|null}
 */
export function usePluginInterop() {
  if (isIsolatedMode()) {
    isolatedUnsupported('usePluginInterop');
  }
  if (typeof global !== 'undefined' && global.pluginInterop) {
    return global.pluginInterop;
  }
  return null;
}

/**
 * @typedef {Object} TitleBarAction
 * @property {string} [id] 预留：宿主按位置生成稳定 id，此字段被忽略
 * @property {string} label 按钮文案（iconOnly 时作为 tooltip 与无障碍名称）
 * @property {string} [icon] Material Symbols 图标名（不带 mdi- 前缀）
 * @property {boolean} [iconOnly] 仅渲染图标按钮（需要 icon 与 label 同时存在）
 * @property {string} [tooltip] 悬停提示
 * @property {boolean} [enabled] 是否可用，默认可用
 * @property {boolean} [visible] 是否渲染，默认渲染
 * @property {Function} [click] 直按钮点击回调（主进程内执行，需为函数）
 * @property {TitleBarAction[]} [submenu] 下拉子菜单，项内额外支持 `{ type: 'separator' }`
 */

/**
 * 设置插件在宿主插件页顶栏（inspect 旁）按钮区的按钮。
 * @description 仅在 **主进程 (Main Process)** 环境可用；隔离模式（plugin.isolated）下抛错。
 * 传入数组整体替换该插件的按钮，传空数组或 null 清除；宿主在插件停用/重启时也会自动清除。
 * 顶层数量与点击项数量有防御性上限（8 / 64），超出部分被忽略。
 * 宿主过旧（无注册表）时返回 false，不影响插件其余功能。
 * @param {string} pluginId 插件 ID (通常与 package.json 中的 name 一致)
 * @param {TitleBarAction[]|null} actions 菜单模板
 * @returns {boolean} 是否生效
 */
export function setTitleBarActions(pluginId, actions) {
  if (isIsolatedMode()) {
    isolatedUnsupported('setTitleBarActions');
  }
  if (actions != null && !Array.isArray(actions)) {
    throw new Error('setTitleBarActions 需要传入按钮模板数组或 null');
  }
  if (typeof global === 'undefined' || !global.titleBarRegistry) {
    // 宿主过旧：静默降级（不打日志，插件其余功能不受影响）
    return false;
  }
  return global.titleBarRegistry.setTitleBarActions(pluginId, actions);
}

// ----------------------------------------------------------------------
// UI & Renderer APIs (Renderer Process Only)
// ----------------------------------------------------------------------

/**
 * 为插件事件名补全 `@插件ID` 后缀。
 * 宿主按 `事件名@插件ID` 路由；显式带 `@` 的事件名视为已限定，保持原样。
 * @param {string} type 事件名
 * @param {string} pluginId 插件 ID
 * @returns {string}
 */
const qualifyIpcType = (type, pluginId) => (
  String(type).includes('@') ? type : `${type}@${pluginId}`
);

/**
 * 获取 IPC 通信工具
 * @description 仅在 **渲染进程 (Renderer Process)** 环境可用。
 * 传入 pluginId 时返回插件专用客户端：invoke / send / on / detach 的事件名
 * 会自动补全 `@插件ID` 后缀，插件代码无需再手拼 `'事件名@插件ID'` 字符串；
 * 显式包含 `@` 的事件名保持原样。不传 pluginId 时行为与旧版一致，返回原始客户端。
 * @param {string} [pluginId] 插件 ID (通常与 package.json 中的 name 一致)
 * @returns {Object|null} 包含 invoke, send, on, detach 方法的对象
 */
export function useIpc(pluginId) {
  const baseIpc = (typeof window !== 'undefined' && window.electron?.useIpc)
    ? window.electron.useIpc()
    : null;
  if (!baseIpc) {
    return null;
  }
  if (!pluginId) {
    return baseIpc;
  }
  return {
    invoke: (type, ...args) => baseIpc.invoke(qualifyIpcType(type, pluginId), ...args),
    send: (type, data) => baseIpc.send(qualifyIpcType(type, pluginId), data),
    on: (type, callback) => baseIpc.on(qualifyIpcType(type, pluginId), callback),
    detach: (type) => baseIpc.detach(qualifyIpcType(type, pluginId)),
  };
}

// ----------------------------------------------------------------------
// Plugin Main Entrypoint Helpers (Main Process)
// ----------------------------------------------------------------------

/**
 * 定义插件主进程 IPC handler。
 * @description 仅用于 **主进程** 导出的 `ipcHandlers`。宿主注册通道时会自动追加
 * `@插件ID` 后缀，因此 `type` 不应包含 `@`；对合法入参原样返回 handlers，
 * 对缺 type / 缺 handler / type 带 `@` 的条目在激活前直接抛错，避免问题延迟到运行期。
 * @param {Array<{type: string, handler: Function}>} handlers IPC handler 定义数组
 * @returns {Array<{type: string, handler: Function}>} 原样返回的 handlers
 */
export function defineIpcHandlers(handlers) {
  if (!Array.isArray(handlers)) {
    throw new Error('defineIpcHandlers 需要传入 ipcHandlers 数组');
  }
  handlers.forEach((entry, index) => {
    if (!entry || typeof entry.type !== 'string' || !entry.type) {
      throw new Error(`defineIpcHandlers: 第 ${index} 项缺少字符串类型的 type 字段`);
    }
    if (typeof entry.handler !== 'function') {
      throw new Error(`defineIpcHandlers: "${entry.type}" 缺少 handler 函数`);
    }
    if (entry.type.includes('@')) {
      throw new Error(`defineIpcHandlers: "${entry.type}" 不应包含 @，宿主注册通道时会自动追加 @插件ID 后缀`);
    }
  });
  return handlers;
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
 * 获取宿主提供的 mde-vue 运行时
 * @description 仅在渲染进程环境可用，返回 { components, directives, functions, theme }；
 * 组件/指令也可直接使用全局注册的 mat-* 标签与 v-intersection / v-state-layer 指令
 * @returns {Object} mde-vue 运行时对象
 */
export function useMat() {
  if (typeof window !== 'undefined' && window.mde$) {
    return window.mde$;
  }
  return {};
}

/**
 * useMat 的别名
 * @returns {Object} mde-vue 运行时对象
 */
export const useMde = useMat;

/**
 * 获取宿主注册的 mde-vue 组件
 * @returns {Record<string, any>}
 */
export function useMatComponents() {
  return useMat().components || {};
}

/**
 * 获取宿主注册的 mde-vue 指令
 * @returns {Record<string, any>}
 */
export function useMatDirectives() {
  return useMat().directives || {};
}

/**
 * 获取 mde-vue 命令式函数（snackbar/toast/dialog/alert/confirm/prompt）
 * @description 依赖宿主通过 window.mde$.functions 暴露；需要宿主支持且为渲染进程环境，
 * 不可用时返回空对象，调用方应做空值兜底
 * @returns {Record<string, Function>}
 */
export function useMatFunctions() {
  return useMat().functions || {};
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
 * 执行宿主注册的插件命令
 * @param {...any} args
 * @returns {Promise<any>}
 */
export async function executePluginCommand(...args) {
  if (typeof window !== 'undefined' && window.ts?.executePluginCommand) {
    return window.ts.executePluginCommand(...args);
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
  if (typeof window !== 'undefined') {
    return {
      async readText() {
        if (window.electron?.useIpc) {
          return window.electron.useIpc().invoke(CLIPBOARD_IPC.readText);
        }
        if (navigator.clipboard?.readText) {
          return navigator.clipboard.readText();
        }
        return null;
      },
      async writeText(text) {
        if (window.electron?.useIpc) {
          return window.electron.useIpc().invoke(CLIPBOARD_IPC.writeText, text);
        }
        if (navigator.clipboard?.writeText) {
          return navigator.clipboard.writeText(text);
        }
        return null;
      },
    };
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
    const mainLogger = global.mainStore?.logger;
    if (!mainLogger) {
      return console;
    }
    // 宿主主进程 logger 是 winston 实例，log(level, message) 签名与 console 语义不同
    // （logger.log('msg') 会在 winston 内部抛 TypeError 且异步上下文中被静默吞掉），
    // 统一包装为 console 兼容接口：log 按 info 级别输出
    return {
      log: (...args) => mainLogger.info(...args),
      info: (...args) => mainLogger.info(...args),
      warn: (...args) => mainLogger.warn(...args),
      error: (...args) => mainLogger.error(...args),
      debug: (...args) => mainLogger.debug(...args),
    };
  }
  if (typeof window !== 'undefined') {
    return window.ts?.logger || console;
  }
  return console;
}

export { electronNetAdapter };
