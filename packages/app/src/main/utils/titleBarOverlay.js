/**
 * Window Controls Overlay 配置工具
 * 背景色始终透明，图标色按深浅模式持久化，供主窗口与插件窗口复用。
 */

export const TITLE_BAR_OVERLAY_COLOR = '#00000000';
export const DEFAULT_SYMBOL_COLOR = {
  dark: '#ffffff',
  light: '#1f1f1f',
};

/**
 * 根据设置主题与系统深浅色解析 overlay 模式
 * @param {string} [settingTheme] - 'dark' | 'light' | 'system'
 * @param {boolean} [shouldUseDarkColors] - nativeTheme.shouldUseDarkColors
 * @returns {'dark' | 'light'}
 */
export const resolveOverlayMode = (settingTheme = 'system', shouldUseDarkColors = false) => (
  settingTheme === 'dark' || (settingTheme === 'system' && shouldUseDarkColors)
    ? 'dark'
    : 'light'
);

/**
 * 解析 BrowserWindow 的 titleBarOverlay 配置
 * @param {object} [params]
 * @param {'dark' | 'light'} [params.overlayMode] - 深浅模式
 * @param {{ symbolColor?: string }|undefined} [params.savedOverlay] - 持久化的 overlay 配置
 * @returns {{ color: string, symbolColor: string }}
 */
export const resolveTitleBarOverlay = ({
  overlayMode = 'light',
  savedOverlay,
} = {}) => ({
  color: TITLE_BAR_OVERLAY_COLOR,
  symbolColor: savedOverlay?.symbolColor || DEFAULT_SYMBOL_COLOR[overlayMode],
});

export default resolveTitleBarOverlay;
