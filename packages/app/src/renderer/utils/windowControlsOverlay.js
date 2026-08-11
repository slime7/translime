/**
 * Window Controls Overlay 尺寸同步工具
 * 读取原生 caption 按钮区域尺寸，写入 CSS 变量供标题栏自适应。
 * 无 API 支持（预览、jsdom）时回退到默认尺寸。
 */

export const WINDOW_CONTROLS_OVERLAY_FALLBACK = {
  height: 32,
  width: 138,
};

/**
 * 读取原生标题栏区域尺寸
 * @returns {{ height: number, width: number } | null}
 */
export const getWindowControlsOverlaySize = () => {
  const wco = navigator.windowControlsOverlay;
  if (!wco?.getTitlebarAreaRect) {
    return null;
  }
  const { height, width } = wco.getTitlebarAreaRect();
  return { height, width };
};

/**
 * 同步标题栏高度与控制区宽度到 :root CSS 变量
 * @returns {{ height: number, width: number }}
 */
export const syncWindowControlsOverlay = () => {
  const size = getWindowControlsOverlaySize() || WINDOW_CONTROLS_OVERLAY_FALLBACK;
  const root = document.documentElement;
  root.style.setProperty('--title-bar-height', `${size.height}px`);
  root.style.setProperty('--window-control-width', `${size.width}px`);
  return size;
};

/**
 * 注册 geometrychange 监听并返回清理函数
 * @returns {() => void}
 */
export const watchWindowControlsOverlay = () => {
  syncWindowControlsOverlay();
  navigator.windowControlsOverlay?.addEventListener('geometrychange', syncWindowControlsOverlay);
  return () => {
    navigator.windowControlsOverlay?.removeEventListener('geometrychange', syncWindowControlsOverlay);
  };
};
