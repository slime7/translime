/**
 * 镜像窗口 chrome（标题区、工具栏条带、边框与留白）的 CSS 度量与工具栏布局判定。
 *
 * 纯计算模块：不触碰 Electron，供 scrcpy.js 在开窗、挂载与显隐判定中引用，
 * 也便于单元测试直接验证布局口径。
 */

// 画面窗口顶部自绘标题栏 CSS 高度（虚拟屏窗口顶部占用）
export const TITLE_BAR_CSS_HEIGHT = 32;
// 镜像窗口顶部标题区自然行高（32px 标题栏 + 上下各 4px 呼吸空间）
export const TITLE_ROW_CSS_HEIGHT = 40;
// 虚拟屏无底部控制条
export const BAR_CSS_HEIGHT = 0;
// 悬浮工具栏 CSS 尺寸（mde 工具栏：40px small 按钮 + 四周 8px 内边距，
// 垂直工具栏宽度与横向工具栏高度同构）
export const TOOLBAR_CSS_WIDTH = 56;
export const TOOLBAR_CSS_HEIGHT = 56;
// 镜像窗口工具栏布局：竖屏手机用右侧垂直工具栏，平板与横屏手机改为底部横向工具栏
export const TOOLBAR_LAYOUT_SIDE = 'side';
export const TOOLBAR_LAYOUT_BOTTOM = 'bottom';
// 宽高比达到该阈值视为平板或横屏手机（4:3=0.75、横屏≥1），
// 竖屏手机（≤16:10=0.625）保持右侧布局
const WIDE_TOOLBAR_RATIO = 0.7;
// SDL 画面区周围 outline 边框 CSS 宽度
export const SDL_BORDER_CSS = 8;
// SDL 画面区内圆角 CSS 半径（20px，与 28px 外圆角扣除 8px 边框后的内圆角一致）
export const SDL_CORNER_RADIUS_CSS = 20;
// 画面区四周统一留白（顶部为标题区与画面框之间，右缘为工具栏到窗口边缘）
export const OUTER_GAP_CSS = 16;
export const TOOLBAR_GAP_CSS = 24;

/**
 * 打开镜像时按设备屏幕比例决定工具栏布局：平板或横屏手机用底部横向工具栏，
 * 竖屏手机用右侧垂直工具栏；分辨率缺失时按竖屏手机处理。
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
 * 画面区四周的非画面占用（CSS 像素）：工具栏条带随布局占用右侧（side）
 * 或底部（bottom），底部布局下左右两侧对称。
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
