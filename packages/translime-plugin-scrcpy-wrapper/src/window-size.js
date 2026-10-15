/**
 * 画面窗口初始尺寸与等比缩放计算。
 *
 * 比例以 SDL 画面区比例（即设备分辨率宽高比）为准，
 * 窗口总尺寸 = 画面尺寸 + 标题栏 + 右侧工具栏 + 8px outline 边框 + 呼吸间距。
 */

const FALLBACK_RESOLUTION = { width: 1080, height: 2400 };
export const MIN_VIDEO_WIDTH = 240;
export const MIN_VIDEO_HEIGHT = 320;

/**
 * 计算窗口内容尺寸（CSS 像素）。
 *
 * @param {object} options
 * @param {{ width: number, height: number } | null} options.resolution - 设备分辨率，缺失时用常见手机比例。
 * @param {{ width: number, height: number }} options.workArea - 目标显示器工作区（CSS 像素）。
 * @param {number} [options.toolbarCssWidth=0] - 右侧垂直工具栏 CSS 宽度。
 * @param {number} [options.titleBarCssHeight=0] - 顶部自绘标题栏 CSS 高度。
 * @param {number} [options.borderCss=0] - SDL 四周 outline 边框 CSS 宽度。
 * @param {number} [options.gapCss=0] - 标题栏、工具栏与主体边框之间的间距。
 * @param {number} [options.barCssHeight=0] - 底部区域 CSS 高度。
 * @param {number} [options.margin=64] - 工作区四周预留的呼吸边距。
 * @returns {{ width: number, height: number }} BrowserWindow 内容尺寸。
 */
export const computeWindowSize = ({
  resolution,
  workArea,
  toolbarCssWidth = 0,
  titleBarCssHeight = 0,
  borderCss = 0,
  gapCss = 0,
  barCssHeight = 0,
  margin = 64,
}) => {
  const device = resolution && resolution.width > 0 && resolution.height > 0
    ? resolution
    : FALLBACK_RESOLUTION;
  const ratio = device.width / device.height;

  const isMirror = toolbarCssWidth > 0;
  const leftOffset = gapCss + borderCss;
  const rightOffset = isMirror
    ? borderCss + 24 + toolbarCssWidth + gapCss
    : borderCss + gapCss + toolbarCssWidth;
  const topOffset = (titleBarCssHeight > 0 ? (gapCss > 0 ? 12 : 0) + titleBarCssHeight : 0) + gapCss + borderCss;
  const bottomOffset = gapCss + borderCss + barCssHeight;

  const chromeW = leftOffset + rightOffset;
  const chromeH = topOffset + bottomOffset;

  const maxWidth = Math.max(MIN_VIDEO_WIDTH, workArea.width - margin - chromeW);
  const maxHeight = Math.max(MIN_VIDEO_HEIGHT, workArea.height - margin - chromeH);

  let videoWidth = maxHeight * ratio;
  if (videoWidth > maxWidth) {
    videoWidth = maxWidth;
  }
  let videoHeight = videoWidth / ratio;
  if (videoHeight > maxHeight) {
    videoHeight = maxHeight;
    videoWidth = videoHeight * ratio;
  }
  // 极小工作区下保证画面可用下限，允许偏离等比
  if (videoWidth < MIN_VIDEO_WIDTH) {
    videoWidth = MIN_VIDEO_WIDTH;
  }
  if (videoHeight < MIN_VIDEO_HEIGHT) {
    videoHeight = MIN_VIDEO_HEIGHT;
  }

  return {
    width: Math.round(videoWidth + chromeW),
    height: Math.round(videoHeight + chromeH),
  };
};

/**
 * 根据拖拽边缘与目标尺寸计算保持视频画面等比的窗口尺寸。
 *
 * @param {object} options
 * @param {number} options.targetWidth - 目标窗口总宽度。
 * @param {number} options.targetHeight - 目标窗口总高度。
 * @param {number} options.currentWidth - 当前窗口总宽度。
 * @param {number} options.currentHeight - 当前窗口总高度。
 * @param {number} options.ratio - 视频宽高比 (videoWidth / videoHeight)。
 * @param {number} options.chromeWidth - 水平非画面宽度（toolbar + 边框 + 间距）。
 * @param {number} options.chromeHeight - 垂直非画面高度（标题栏 + 边框 + 间距）。
 * @param {string} [options.edge] - 拖拽边缘。
 * @param {number} [options.minVideoWidth=240] - 最小视频宽度。
 * @param {number} [options.minVideoHeight=320] - 最小视频高度。
 * @returns {{ width: number, height: number }}
 */
export const calculateProportionalSize = ({
  targetWidth,
  targetHeight,
  currentWidth,
  currentHeight,
  ratio,
  chromeWidth,
  chromeHeight,
  edge = '',
  minVideoWidth = MIN_VIDEO_WIDTH,
  minVideoHeight = MIN_VIDEO_HEIGHT,
}) => {
  if (!ratio || ratio <= 0) {
    return {
      width: Math.max(minVideoWidth + chromeWidth, Math.round(targetWidth)),
      height: Math.max(minVideoHeight + chromeHeight, Math.round(targetHeight)),
    };
  }

  let videoW = targetWidth - chromeWidth;
  let videoH = targetHeight - chromeHeight;

  const isHorizontalEdge = edge === 'left' || edge === 'right';
  const isVerticalEdge = edge === 'top' || edge === 'bottom';
  const isCorner = edge === 'top-left' || edge === 'top-right' || edge === 'bottom-left' || edge === 'bottom-right';

  if (isHorizontalEdge) {
    videoW = Math.max(minVideoWidth, videoW);
    videoH = Math.round(videoW / ratio);
    if (videoH < minVideoHeight) {
      videoH = minVideoHeight;
      videoW = Math.round(videoH * ratio);
    }
  } else if (isVerticalEdge) {
    videoH = Math.max(minVideoHeight, videoH);
    videoW = Math.round(videoH * ratio);
    if (videoW < minVideoWidth) {
      videoW = minVideoWidth;
      videoH = Math.round(videoH / ratio);
    }
  } else if (isCorner) {
    const deltaW = Math.abs(targetWidth - currentWidth);
    const deltaH = Math.abs(targetHeight - currentHeight);
    if (deltaW >= deltaH * ratio) {
      videoW = Math.max(minVideoWidth, videoW);
      videoH = Math.round(videoW / ratio);
      if (videoH < minVideoHeight) {
        videoH = minVideoHeight;
        videoW = Math.round(videoH * ratio);
      }
    } else {
      videoH = Math.max(minVideoHeight, videoH);
      videoW = Math.round(videoH * ratio);
      if (videoW < minVideoWidth) {
        videoW = minVideoWidth;
        videoH = Math.round(videoW / ratio);
      }
    }
  } else {
    videoW = Math.max(minVideoWidth, videoW);
    videoH = Math.round(videoW / ratio);
    if (videoH < minVideoHeight) {
      videoH = minVideoHeight;
      videoW = Math.round(videoH * ratio);
    }
  }

  return {
    width: Math.round(videoW + chromeWidth),
    height: Math.round(videoH + chromeHeight),
  };
};

/**
 * 计算画面矩形在可用区域内的摆放位置。
 *
 * aspect（设备分辨率）存在时等比缩放并居中，形成黑边 letterbox；
 * 缺失或虚拟屏模式时铺满整个可用区域。
 *
 * @param {object} options
 * @param {number} options.areaWidth - 可用区域宽（物理像素）。
 * @param {number} options.areaHeight - 可用区域高（物理像素）。
 * @param {{ width: number, height: number } | null} options.aspect - 设备分辨率。
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export const fitVideoRect = ({ areaWidth, areaHeight, aspect }) => {
  const safeW = Math.max(1, Math.round(areaWidth));
  const safeH = Math.max(1, Math.round(areaHeight));
  if (!aspect || !(aspect.width > 0) || !(aspect.height > 0) || safeW <= 1 || safeH <= 1) {
    return {
      x: 0,
      y: 0,
      width: safeW,
      height: safeH,
    };
  }
  const ratio = aspect.width / aspect.height;
  let width = Math.min(safeW, Math.round(safeH * ratio));
  const height = Math.min(safeH, Math.round(width / ratio));
  width = Math.min(safeW, Math.round(height * ratio));
  return {
    x: Math.round((safeW - width) / 2),
    y: Math.round((safeH - height) / 2),
    width,
    height,
  };
};

export default computeWindowSize;
