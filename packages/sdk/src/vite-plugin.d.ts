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
 * 创建运行时 CSS 注入配置
 * 用于 `vite-plugin-css-injected-by-js`
 */
export function createPluginCssInjectionOptions(styleId: string): {
  styleId: string;
  injectCodeFunction: (cssCode: string, options: { styleId: string }) => void;
};

/**
 * 创建插件 UI 样式隔离所需的 Vite 插件集合
 * 负责运行时 CSS 注入、样式 ID 去重，并将插件样式放入插件专用 layer
 */
export function createPluginCssIsolationPlugins(styleId: string): Plugin[];

export default translimeSdk;
