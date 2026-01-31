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
 * 获取 Preview 模式的 Vuetify 样式配置文件路径
 * 用于 vite-plugin-vuetify 的 styles.configFile 配置
 */
export function getPreviewSettingsPath(): string;

export default translimeSdk;
