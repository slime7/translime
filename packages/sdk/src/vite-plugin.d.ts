import { Plugin } from 'vite';

interface TranslimeSdkOptions {
  /**
   * Preview 模式下要渲染的组件路径
   */
  previewComponent?: string;
}

/**
 * Translime SDK Vite Plugin
 * 自动处理 electron 外部化、Preview 模式等构建配置
 */
export function translimeSdk(options?: TranslimeSdkOptions): Plugin;

/**
 * 创建构建阶段 CSS 作用域隔离插件
 * 会将插件产出的选择器限制在 `.plugin-ui-loader[data-plugin-id="..."]` 下
 */
export function createPluginCssScopePlugin(styleId: string): Plugin;

/**
 * 创建运行时 CSS 注入配置
 * 用于 `vite-plugin-css-injected-by-js`
 */
export function createPluginCssInjectionOptions(styleId: string): {
  styleId: string;
  injectCodeFunction: (cssCode: string, options: { styleId: string }) => void;
};

/**
 * 创建插件 UI 样式隔离所需的 Vite 插件集合
 * 默认包含：
 * 1. 构建阶段 CSS 选择器作用域化
 * 2. 运行时 CSS 注入，并将最外层 layer 固定为插件 id
 */
export function createPluginCssIsolationPlugins(styleId: string): Plugin[];

export default translimeSdk;
