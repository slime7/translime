export interface Config {
  get(key: string, defaultValue?: any): any;
  set(key: string, value: any): void;
}

export interface MainStore {
  config: Config;
}

export interface PluginCommandContribution {
  id: string;
  title?: string;
}

export interface PluginManifest {
  activationEvents?: string[];
  dependencies?: string[];
  optionalDependencies?: string[];
  contributes?: {
    commands?: PluginCommandContribution[];
  };
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

export interface PluginInterop {
  /**
   * 获取目标插件的 API 引用
   * @param pluginId 插件 ID
   */
  getExports<T = any>(pluginId: string): T | undefined;

  /**
   * 获取所有已注册公共 API 的插件列表
   */
  getRegisteredPlugins(): string[];

  /**
   * 等待目标插件被激活并获取其 API
   * @param pluginId 目标插件 ID
   * @param timeout 超时时间 (毫秒)，默认 10000。0 表示永不超时
   */
  waitForPlugin<T = any>(pluginId: string, timeout?: number): Promise<T>;

  on(event: 'activated', listener: (pluginId: string, exports: any) => void): this;
  on(event: 'deactivated', listener: (pluginId: string) => void): this;
  off(event: 'activated', listener: (pluginId: string, exports: any) => void): this;
  off(event: 'deactivated', listener: (pluginId: string) => void): this;
}

/**
 * 获取插件间通信工具 (仅在主进程环境可用)
 */
export function usePluginInterop(): PluginInterop | null;

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
 * mde-vue 主题控制器（Material 2025 动态主题）的宿主侧实例
 */
export interface MatThemeController {
  readonly mode: 'light' | 'dark' | 'system';
  readonly resolvedMode: 'light' | 'dark';
  readonly seedColor: string;
  readonly schemeVariant: 'tonal-spot' | 'neutral' | 'vibrant' | 'expressive';
  setMode(value: 'light' | 'dark' | 'system'): void;
  setSeedColor(value: string): void;
  setSchemeVariant(value: 'tonal-spot' | 'neutral' | 'vibrant' | 'expressive'): void;
  setContrastLevel(value: number): void;
}

/**
 * 获取宿主提供的 mde-vue 运行时
 * @description 仅在渲染进程环境可用，返回 { components, directives, theme }；
 * 组件/指令也可直接使用全局注册的 mat-* 标签与 v-intersection / v-state-layer 指令
 */
export function useMat(): {
  components: Record<string, any>;
  directives: Record<string, any>;
  theme?: MatThemeController;
};

/**
 * useMat 的别名
 */
export function useMde(): {
  components: Record<string, any>;
  directives: Record<string, any>;
  theme?: MatThemeController;
};

/**
 * 获取所有宿主注册的 mde-vue 组件（mat-* / mde-*）
 */
export function useMatComponents(): Record<string, any>;

/**
 * 获取所有宿主注册的 mde-vue 指令（v-intersection / v-state-layer）
 */
export function useMatDirectives(): Record<string, any>;

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
 * 执行宿主注册的插件命令
 */
export function executePluginCommand(...args: any[]): Promise<any>;

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

/**
 * Axios adapter backed by `window.ts.net`.
 */
export function electronNetAdapter(config: any): Promise<any>;
