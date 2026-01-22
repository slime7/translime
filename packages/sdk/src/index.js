/**
 * Translime SDK
 * 提供插件开发所需的标准 API 和类型提示
 */

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
export function useComponents() {
  return useVuetify().components || {};
}

/**
 * 快捷获取常用的 Vuetify 组件
 * 方便在 Vue setup 中解构使用
 */
export function useVuetifyComponents() {
  const components = useComponents();
  return {
    VContainer: components.VContainer,
    VRow: components.VRow,
    VCol: components.VCol,
    VBtn: components.VBtn,
    VIcon: components.VIcon,
    VCard: components.VCard,
    VCardTitle: components.VCardTitle,
    VCardText: components.VCardText,
    VCardActions: components.VCardActions,
    VTextField: components.VTextField,
    VDialog: components.VDialog,
    VSpacer: components.VSpacer,
    VToolbar: components.VToolbar,
    VToolbarTitle: components.VToolbarTitle,
    VSnackbar: components.VSnackbar,
    VProgressCircular: components.VProgressCircular,
    VDivider: components.VDivider,
    VChip: components.VChip,
    VTooltip: components.VTooltip,
    VExpansionPanels: components.VExpansionPanels,
    VExpansionPanel: components.VExpansionPanel,
    VExpansionPanelTitle: components.VExpansionPanelTitle,
    VExpansionPanelText: components.VExpansionPanelText,
    VList: components.VList,
    VListItem: components.VListItem,
    VListItemTitle: components.VListItemTitle,
    VListItemSubtitle: components.VListItemSubtitle,
    VAvatar: components.VAvatar,
    VAlert: components.VAlert,
  };
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
