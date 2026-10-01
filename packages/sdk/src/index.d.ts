// ----------------------------------------------------------------------
// 通用类型
// ----------------------------------------------------------------------

/**
 * electron-store 配置实例的子集
 */
export interface Config {
  get(key: string, defaultValue?: any): any;
  set(key: string, value: any): void;
}

/**
 * 宿主主进程全局 Store（global.mainStore）
 */
export interface MainStore {
  config: Config;
  logger?: Console;
}

// ----------------------------------------------------------------------
// manifest（package.json 内的 plugin 字段）
// 编辑期校验与补全：引用 translime-plugin.schema.json
// （随 SDK 发布，模板 package.json 已通过 $schema 引用）
// ----------------------------------------------------------------------

export interface PluginCommandContribution {
  id: string;
  title?: string;
}

export interface PluginManifest {
  activationEvents?: Array<
    | 'onStartup'
    | 'onAppReady'
    | 'onView'
    | `onCommand:${string}`
    | `onIpc:${string}`
  >;
  dependencies?: string[];
  optionalDependencies?: string[];
  /**
   * 以隔离进程（utilityProcess）运行插件主进程代码
   */
  isolated?: boolean;
  contributes?: {
    commands?: PluginCommandContribution[];
  };
}

// ----------------------------------------------------------------------
// 插件主进程入口导出契约
// ----------------------------------------------------------------------

/**
 * IPC handler 上下文，由宿主在注册时注入
 */
export interface IpcHandlerContext {
  /**
   * 主动推送消息到插件 UI（渲染端通过 `ipc.on(type, cb)` 接收）
   */
  sendToClient(type: string, data: unknown): void;
}

/**
 * 单个 IPC handler：`handler(context)` 返回实际处理函数，
 * 处理函数的参数即渲染端 `ipc.invoke(type, ...args)` 传入的参数
 */
export type IpcHandler = (context: IpcHandlerContext) => (...args: any[]) => any;

export interface IpcHandlerEntry {
  /**
   * 事件名，不含 `@插件ID` 后缀——宿主注册通道时会自动追加
   */
  type: string;
  handler: IpcHandler;
}

/**
 * 定义插件主进程 IPC handler（主进程专用）。
 * 对缺 type / 缺 handler / type 带 `@` 的条目直接抛错；合法入参原样返回。
 */
export function defineIpcHandlers(handlers: IpcHandlerEntry[]): IpcHandlerEntry[];

export interface PluginCommandEntry {
  /**
   * 命令 ID，需与 manifest `plugin.contributes.commands[].id` 一致
   */
  id: string;
  handler: (...args: any[]) => any;
}

/**
 * Electron MenuItem 的宿主支持子集（渲染端 M3 菜单渲染）
 */
export interface PluginMenuEntry {
  id?: string;
  label?: string;
  type?: 'normal' | 'separator' | 'checkbox';
  checked?: boolean;
  enabled?: boolean;
  visible?: boolean;
  click?(...args: any[]): void;
}

interface SettingMenuItemBase {
  /** 配置存储键；缺省时取 name 的值 */
  key?: string;
  name: string;
  required?: boolean;
  placeholder?: string;
}

export type SettingMenuItem =
  | (SettingMenuItemBase & { type: 'input' | 'password' })
  | (SettingMenuItemBase & { type: 'switch' })
  | (SettingMenuItemBase & {
      type: 'checkbox' | 'radio' | 'list';
      /** 字符串数组简写时，选项值即字符串本身 */
      choices: Array<string | { name: string; value?: any }>;
    })
  | (SettingMenuItemBase & {
      type: 'file';
      /** 保存格式：'array' 返回全部选择结果（默认），'string' 保存第一个路径 */
      valueType?: 'array' | 'string';
      /** 透传给 Electron dialog.showOpenDialog 的参数 */
      dialogOptions?: Record<string, any>;
    });

/**
 * 插件主进程入口的全部可导出成员（命名导出，并在 default export 中汇总）
 */
export interface TranslimePluginExports {
  /** 激活时执行，适合初始化 */
  pluginDidLoad?(...args: any[]): void | Promise<void>;
  /** 禁用或应用关闭前执行，适合清理 */
  pluginWillUnload?(...args: any[]): void | Promise<void>;
  /** 插件设置在 UI 保存后触发 */
  pluginSettingSaved?(...args: any[]): void | Promise<void>;
  /** 设置面板声明式配置项 */
  settingMenu?: SettingMenuItem[];
  /** 附加菜单项（渲染端 M3 菜单，支持 Electron MenuItem 子集） */
  pluginMenu?: PluginMenuEntry[];
  /** IPC handler 数组，宿主注册通道时会自动追加 `@插件ID` 后缀 */
  ipcHandlers?: IpcHandlerEntry[];
  /** 运行期命令处理函数，需与 manifest 静态命令声明配套 */
  commands?: PluginCommandEntry[];
  /** 通过 pluginInterop 暴露给其他插件的公共 API（隔离模式不支持） */
  libs?: Record<string, any>;
  /** 独立窗口模式的 BrowserWindow 选项（仅 windowUrl 模式生效） */
  windowOptions?: Record<string, any>;
}

// ----------------------------------------------------------------------
// 渲染进程 IPC
// ----------------------------------------------------------------------

/**
 * 渲染进程 IPC 客户端
 */
export interface IpcClient {
  /**
   * 调用插件主进程 IPC handler
   * @param type 事件名；`useIpc(pluginId)` 返回的客户端会自动补全 `@插件ID` 后缀
   */
  invoke(type: string, ...args: any[]): Promise<any>;
  /**
   * 发送单向消息（白名单通道封装）
   */
  send(type: string, data?: any): void;
  /**
   * 监听主进程 `sendToClient` 推送；同名事件重复注册会先移除旧监听
   */
  on(type: string, callback: (data: any) => void): void;
  /**
   * 移除指定事件的监听
   */
  detach(type: string): void;
}

/**
 * 获取原始 IPC 客户端（事件名需自带 `@插件ID` 后缀）
 */
export function useIpc(): IpcClient | null;
/**
 * 获取插件专用 IPC 客户端：invoke / send / on / detach 的事件名
 * 自动补全 `@插件ID` 后缀；显式包含 `@` 的事件名保持原样
 *
 * @param pluginId 插件 ID（与 package.json name 一致）
 * @example
 * const ipc = useIpc('translime-plugin-example');
 * await ipc.invoke('test-ipc', arg1, arg2); // 实际调用 'test-ipc@translime-plugin-example'
 */
export function useIpc(pluginId: string): IpcClient | null;

// ----------------------------------------------------------------------
// 渲染进程宿主能力
// ----------------------------------------------------------------------

/**
 * 渲染端可用的 Electron 对话框 API（经宿主 IPC 桥接，均为异步）
 */
export interface ElectronDialogResult {
  canceled: boolean;
  filePaths?: string[];
  filePath?: string;
  response?: number;
}

export interface ElectronDialog {
  showOpenDialog(options?: Record<string, any>): Promise<ElectronDialogResult>;
  showSaveDialog(options?: Record<string, any>): Promise<ElectronDialogResult>;
  showMessageBox(options?: Record<string, any>): Promise<ElectronDialogResult>;
  showErrorBox(title: string, content: string): Promise<void>;
  showCertificateTrustDialog(options?: Record<string, any>): Promise<void>;
}

/**
 * 渲染端可用的 Electron shell API（经宿主 IPC 桥接）
 */
export interface ElectronShell {
  openExternal(url: string): Promise<void>;
  openPath(path: string): Promise<string>;
  showItemInFolder(path: string): void;
}

export interface ClipboardClient {
  readText(): Promise<string | null>;
  writeText(text: string): Promise<void>;
  readImage(): Promise<any>;
  writeImage(image: any): Promise<void>;
}

export interface WindowControlClient {
  /** 打开指定（或当前）窗口的 devtools */
  devtools(win?: any): Promise<any>;
  maximize(win?: any): Promise<any>;
  unmaximize(win?: any): Promise<any>;
  minimize(win?: any): Promise<any>;
  close(win?: any): Promise<any>;
}

/**
 * 宿主注入的 Vuetify 4 运行时（window.vuetify$）
 */
export interface VuetifyRuntime {
  components: Record<string, any>;
  directives: Record<string, any>;
  labs?: Record<string, any>;
  instance?: any;
}

// ----------------------------------------------------------------------
// 渲染进程 API
// ----------------------------------------------------------------------

/**
 * 获取 Vuetify 实例（渲染进程；宿主提供 window.vuetify$，缺失时返回空对象）
 */
export function useVuetify(): VuetifyRuntime;

/**
 * 获取所有 Vuetify 组件
 */
export function useVuetifyComponents(): Record<string, any>;

/**
 * 获取所有 Vuetify 指令
 */
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
 * mde-vue 命令式函数（window.mde$.functions）
 */
export interface MatFunctions {
  /** 底部消息提示（toast 为其别名） */
  snackbar(options: Record<string, any>): Promise<void>;
  toast(options: Record<string, any>): Promise<void>;
  /** 命令式对话框，动作返回对应 value，取消返回 undefined */
  dialog<T = unknown>(options?: Record<string, any>): Promise<T | undefined>;
  alert(options?: Record<string, any>): Promise<void>;
  confirm(options?: Record<string, any>): Promise<boolean>;
  prompt(options?: Record<string, any>): Promise<string | null>;
}

/**
 * mde-vue 运行时（window.mde$）
 */
export interface MatRuntime {
  components: Record<string, any>;
  directives: Record<string, any>;
  functions?: MatFunctions;
  theme?: MatThemeController;
}

/**
 * 获取宿主提供的 mde-vue 运行时（渲染进程）。
 * 组件/指令也可直接使用全局注册的 mat-* 标签与 v-intersection / v-state-layer 指令
 */
export function useMat(): MatRuntime;

/**
 * useMat 的别名
 */
export function useMde(): MatRuntime;

/**
 * 获取所有宿主注册的 mde-vue 组件（mat-* / mde-*）
 */
export function useMatComponents(): Record<string, any>;

/**
 * 获取所有宿主注册的 mde-vue 指令（v-intersection / v-state-layer）
 */
export function useMatDirectives(): Record<string, any>;

/**
 * 获取 mde-vue 命令式函数（snackbar/toast/dialog/alert/confirm/prompt，渲染进程）。
 * 依赖宿主通过 window.mde$.functions 暴露，不可用时返回空对象，调用方应做空值兜底
 */
export function useMatFunctions(): Partial<MatFunctions>;

/**
 * 获取 Electron 对话框 API（渲染进程）
 */
export function useDialog(): ElectronDialog | null;

/**
 * 获取 Shell API（渲染进程）
 */
export function useShell(): ElectronShell | null;

/**
 * 获取插件自身设置（渲染进程）
 * @param pluginId 插件 ID
 * @returns `plugin.<插件ID>.settings` 下的全部键值
 */
export function getPluginSetting(pluginId: string): Promise<Record<string, any>>;

/**
 * 更新插件自身设置（渲染进程），两种重载：
 * - 传入对象：整体合并写入 `plugin.<插件ID>.settings`
 * - 传入键值：写入单个 `plugin.<插件ID>.settings.<key>`
 */
export function setPluginSetting(
  pluginId: string,
  settings: Record<string, any>,
): Promise<boolean>;
export function setPluginSetting(
  pluginId: string,
  key: string,
  value: unknown,
): Promise<boolean>;

/**
 * 执行宿主注册的插件命令（命令 ID 需在 manifest 中静态声明）
 */
export function executePluginCommand(
  commandId: string,
  ...args: any[]
): Promise<any>;

/**
 * 获取窗口控制工具（渲染进程）
 */
export function useWindowControl(): WindowControlClient | null;

/**
 * 获取剪贴板工具（渲染进程；preview 模式回退浏览器 Clipboard API）
 */
export function useClipboard(): ClipboardClient | null;

/**
 * 在系统默认浏览器中打开链接（渲染进程；宿主仅放行 http/https）
 */
export function openLink(url: string): Promise<void>;

// ----------------------------------------------------------------------
// 主进程 API
// ----------------------------------------------------------------------

/**
 * 检查当前是否为 Preview 模式
 */
export function isPreviewMode(): boolean;

/**
 * 当前是否运行在宿主的隔离插件子进程（plugin.isolated: true）中。
 * 隔离模式下 getMainStore / usePluginConfig / usePluginInterop 会抛错。
 */
export function isIsolatedMode(): boolean;

/**
 * 获取主程序 Store（仅主进程；隔离模式下抛错）
 */
export function getMainStore(): MainStore | null;

/**
 * 获取插件配置代理，读写 `plugin.<插件ID>.settings.*`（仅主进程；隔离模式下抛错）
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
 * 获取插件间通信工具（仅主进程；隔离模式下抛错）
 */
export function usePluginInterop(): PluginInterop | null;

// ----------------------------------------------------------------------
// 通用 API
// ----------------------------------------------------------------------

export interface TranslimeLogger {
  log(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  debug(...args: any[]): void;
  child(meta: Record<string, any>): TranslimeLogger;
}

/**
 * 获取日志工具（主进程走 winston，渲染进程经宿主 IPC 桥接）
 */
export function useLogger(): TranslimeLogger;

/**
 * `electronNetAdapter` 的响应结构（axios adapter 契约的子集）
 */
export interface ElectronNetResponse {
  data: any;
  status?: number;
  statusText: string;
  headers: Record<string, any>;
  config: Record<string, any>;
  request: Record<string, any>;
}

/**
 * Axios adapter backed by `window.ts.net`（仅渲染进程；
 * preview 模式自动回退 mock net，适合基础联调）
 */
export function electronNetAdapter(config: Record<string, any>): Promise<ElectronNetResponse>;
