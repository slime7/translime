/**
 * 镜像窗口 chrome（标题区、工具栏、边框与留白）的度量与布局判定
 */

// 画面窗口顶部自绘标题栏 CSS 高度
export const TITLE_BAR_CSS_HEIGHT = 32;
// 镜像窗口顶部标题区高度
export const TITLE_ROW_CSS_HEIGHT = 40;
// 虚拟屏无底部控制条
export const BAR_CSS_HEIGHT = 0;
// 悬浮工具栏尺寸
export const TOOLBAR_CSS_WIDTH = 56;
export const TOOLBAR_CSS_HEIGHT = 56;
// 工具栏布局模式
export const TOOLBAR_LAYOUT_SIDE = 'side';
export const TOOLBAR_LAYOUT_BOTTOM = 'bottom';
const WIDE_TOOLBAR_RATIO = 0.7;
// SDL 画面区周围边框宽度与圆角半径
export const SDL_BORDER_CSS = 8;
export const SDL_CORNER_RADIUS_CSS = 20;
// 间距常量
export const OUTER_GAP_CSS = 16;
export const TOOLBAR_GAP_CSS = 24;

/**
 * 根据分辨率宽高比确定工具栏布局
 */
export const resolveMirrorToolbarLayout = (resolution) => {
  if (!resolution || !(resolution.width > 0) || !(resolution.height > 0)) {
    return TOOLBAR_LAYOUT_SIDE;
  }
  return resolution.width / resolution.height >= WIDE_TOOLBAR_RATIO
    ? TOOLBAR_LAYOUT_BOTTOM
    : TOOLBAR_LAYOUT_SIDE;
};

/**
 * 计算画面区四周的非画面占用与偏移
 */
export const getChromeMetrics = (mode = 'mirror', toolbarLayout = TOOLBAR_LAYOUT_SIDE) => {
  if (mode === 'virtual') {
    return {
      leftOffset: 0,
      rightOffset: 0,
      topOffset: TITLE_BAR_CSS_HEIGHT,
      bottomOffset: 0,
      chromeWidth: 0,
      chromeHeight: TITLE_BAR_CSS_HEIGHT,
    };
  }
  const bottomToolbar = toolbarLayout === TOOLBAR_LAYOUT_BOTTOM;
  const leftOffset = OUTER_GAP_CSS + SDL_BORDER_CSS;
  const rightOffset = bottomToolbar
    ? SDL_BORDER_CSS + OUTER_GAP_CSS
    : SDL_BORDER_CSS + TOOLBAR_GAP_CSS + TOOLBAR_CSS_WIDTH + OUTER_GAP_CSS;
  const topOffset = TITLE_ROW_CSS_HEIGHT + OUTER_GAP_CSS + SDL_BORDER_CSS;
  const bottomOffset = bottomToolbar
    ? SDL_BORDER_CSS + TOOLBAR_GAP_CSS + TOOLBAR_CSS_HEIGHT + OUTER_GAP_CSS
    : OUTER_GAP_CSS + SDL_BORDER_CSS;
  return {
    leftOffset,
    rightOffset,
    topOffset,
    bottomOffset,
    chromeWidth: leftOffset + rightOffset,
    chromeHeight: topOffset + bottomOffset,
  };
};
