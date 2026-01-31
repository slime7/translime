export interface Config {
  get(key: string, defaultValue?: any): any;
  set(key: string, value: any): void;
}

export interface MainStore {
  config: Config;
}

/**
 * 检查当前是否为 Preview 模式
 */
export function isPreviewMode(): boolean;

/**
 * 获取主程序 Store (仅在主进程环境可用)
 */
export function getMainStore(): MainStore | null;

/**
 * 获取插件配置代理
 * @param pluginId 插件 ID
 */
export function usePluginConfig(pluginId: string): Config;

/**
 * 获取 IPC 工具 (仅在渲染进程环境可用)
 */
export function useIpc(): any;

/**
 * 获取 Vuetify 实例
 */
export function useVuetify(): any;

/**
 * 获取所有 Vuetify 组件
 */
export function useVuetifyComponents(): Record<string, any>;
export function useVuetifyDirectives(): Record<string, any>;

/**
 * 助手函数：获取 Electron 提供的对话框 API
 */
export function useDialog(): any;

/**
 * 获取 Shell API
 */
export function useShell(): any;

/**
 * 获取插件设置 (仅在渲染进程环境可用)
 */
export function getPluginSetting(...args: any[]): Promise<any>;

/**
 * 设置插件设置 (仅在渲染进程环境可用)
 */
export function setPluginSetting(...args: any[]): Promise<any>;

/**
 * 获取窗口控制工具 (仅在渲染进程环境可用)
 */
export function useWindowControl(): {
  devtools(win?: any): Promise<any>;
  maximize(win?: any): Promise<any>;
  unmaximize(win?: any): Promise<any>;
  minimize(win?: any): Promise<any>;
  close(win?: any): Promise<any>;
} | null;

/**
 * 获取剪贴板工具 (仅在渲染进程环境可用)
 */
export function useClipboard(): any;

/**
 * 在浏览器中打开链接 (仅在渲染进程环境可用)
 */
export function openLink(...args: any[]): Promise<any>;

/**
 * 获取日志工具
 */
export function useLogger(): {
  log(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  debug(...args: any[]): void;
};

