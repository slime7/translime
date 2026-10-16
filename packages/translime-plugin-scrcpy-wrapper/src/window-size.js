/**
 * 画面窗口初始尺寸与等比缩放计算。
 *
 * 比例以 SDL 画面区比例（即设备分辨率宽高比）为准，
 * 窗口总尺寸 = 画面尺寸 + 标题区行高 + 右侧工具栏 + 8px outline 边框 + 四周留白。
 * 镜像模式的标题栏悬浮在顶部标题区行内，行高即全部顶部占用；
 * 虚拟屏模式顶部仅剩原生标题栏高度。
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
 * @param {number} [options.toolbarGapCss=24] - 工具栏与画面区的 CSS 间距。
 * @param {number} [options.titleBarCssHeight=0] - 顶部标题区 CSS 高度。
 * @param {number} [options.topGapCss=0] - 标题区上方的额外顶部留白。
 * @param {number} [options.borderCss=0] - SDL 四周 outline 边框 CSS 宽度。
 * @param {number} [options.gapCss=0] - 画面区四周统一留白。
 * @param {number} [options.barCssHeight=0] - 底部区域 CSS 高度。
 * @param {number} [options.margin=64] - 工作区四周预留的呼吸边距。
 * @returns {{ width: number, height: number }} BrowserWindow 内容尺寸。
 */
export const computeWindowSize = ({
  resolution,
  workArea,
  toolbarCssWidth = 0,
  toolbarGapCss = 24,
  titleBarCssHeight = 0,
  topGapCss = 0,
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
    ? borderCss + toolbarGapCss + toolbarCssWidth + gapCss
    : borderCss + gapCss + toolbarCssWidth;
  const topOffset = titleBarCssHeight + topGapCss + borderCss;
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
 * 设备横竖屏切换后交换画面宽高得到新窗口内容尺寸。
 *
 * 旋转只改变方向、不改变内容量级，交换宽高让旋转后的窗口与旋转前
 * 视觉大小大致相当；交换结果超出画面区上限时按比例整体缩小。
 *
 * @param {object} options
 * @param {number} options.width - 当前窗口内容宽度。
 * @param {number} options.height - 当前窗口内容高度。
 * @param {number} options.chromeWidth - 水平非画面宽度。
 * @param {number} options.chromeHeight - 垂直非画面高度。
 * @param {number} [options.maxVideoWidth] - 画面区宽度上限（CSS 像素）。
 * @param {number} [options.maxVideoHeight] - 画面区高度上限（CSS 像素）。
 * @returns {{ width: number, height: number }}
 */
export const swapVideoContentSize = ({
  width,
  height,
  chromeWidth,
  chromeHeight,
  maxVideoWidth = null,
  maxVideoHeight = null,
}) => {
  const videoW = Math.max(1, width - chromeWidth);
  const videoH = Math.max(1, height - chromeHeight);
  const nextW = videoH;
  const nextH = videoW;
  const scale = Math.min(
    1,
    maxVideoWidth > 0 ? maxVideoWidth / nextW : 1,
    maxVideoHeight > 0 ? maxVideoHeight / nextH : 1,
  );
  return {
    width: Math.round(nextW * scale) + chromeWidth,
    height: Math.round(nextH * scale) + chromeHeight,
  };
};

/**
 * 计算把画面区修正回设备比例所需的窗口内容尺寸。
 *
 * 默认宽度保持不变、高度按比例取整对齐；偏差在容差内时返回 null（无需修正），
 * 避免 DPI 取整误差导致修正与 resize 事件互相触发形成抖动。
 * 给定画面区上限时（如设备横竖屏切换后比例反转），先按上限裁剪再比对，
 * 保证修正后的窗口始终留在屏幕内。
 *
 * @param {object} options
 * @param {number} options.width - 当前窗口内容宽度。
 * @param {number} options.height - 当前窗口内容高度。
 * @param {number} options.ratio - 视频宽高比。
 * @param {number} options.chromeWidth - 水平非画面宽度。
 * @param {number} options.chromeHeight - 垂直非画面高度。
 * @param {number} [options.tolerancePx=1] - 允许的画面区像素偏差。
 * @param {number} [options.maxVideoWidth] - 画面区宽度上限（CSS 像素）。
 * @param {number} [options.maxVideoHeight] - 画面区高度上限（CSS 像素）。
 * @returns {{ width: number, height: number } | null} 需要修正时的新尺寸。
 */
export const calculateAspectCorrection = ({
  width,
  height,
  ratio,
  chromeWidth,
  chromeHeight,
  tolerancePx = 1,
  maxVideoWidth = null,
  maxVideoHeight = null,
}) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || !ratio || ratio <= 0) {
    return null;
  }
  const videoW = width - chromeWidth;
  const videoH = height - chromeHeight;
  if (videoW <= 0 || videoH <= 0) {
    return null;
  }
  let nextW = videoW;
  let nextH = Math.round(videoW / ratio);
  if (maxVideoHeight && nextH > maxVideoHeight) {
    nextH = maxVideoHeight;
    nextW = Math.round(nextH * ratio);
  }
  if (maxVideoWidth && nextW > maxVideoWidth) {
    nextW = maxVideoWidth;
    nextH = Math.round(nextW / ratio);
  }
  if (Math.abs(videoH - nextH) <= tolerancePx && Math.abs(videoW - nextW) <= tolerancePx) {
    return null;
  }
  return { width: nextW + chromeWidth, height: nextH + chromeHeight };
};

/**
 * 恢复保存的镜像窗口尺寸：先按工作区上限裁剪，再修正回设备比例。
 *
 * 保存值可能来自比例修正生效前或另一块 DPI 不同的屏幕，直接恢复会带出
 * 偏离比例的窗口，画面 letterbox 后四周留白不再固定。
 *
 * @param {object} options
 * @param {{ width: number, height: number }} options.savedSize - 上次保存的内容尺寸。
 * @param {number | null} options.ratio - 视频宽高比，缺失时仅裁剪。
 * @param {number} options.chromeWidth - 水平非画面宽度。
 * @param {number} options.chromeHeight - 垂直非画面高度。
 * @param {number} options.maxWidth - 工作区允许的最大宽度。
 * @param {number} options.maxHeight - 工作区允许的最大高度。
 * @returns {{ width: number, height: number }}
 */
export const restoreMirrorContentSize = ({
  savedSize,
  ratio,
  chromeWidth,
  chromeHeight,
  maxWidth,
  maxHeight,
}) => {
  const maxVideoW = Math.max(1, maxWidth - chromeWidth);
  const maxVideoH = Math.max(1, maxHeight - chromeHeight);
  let videoW = Math.max(1, Math.min(savedSize.width - chromeWidth, maxVideoW));
  let videoH = Math.max(1, Math.min(savedSize.height - chromeHeight, maxVideoH));
  if (ratio && ratio > 0) {
    // 先按保存宽度等比还原；高度超出上限（如换到更矮的屏幕）时改按高度等比
    const heightByWidth = Math.round(videoW / ratio);
    if (heightByWidth <= maxVideoH) {
      videoH = heightByWidth;
    } else {
      videoW = Math.round(videoH * ratio);
    }
  }
  return {
    width: videoW + chromeWidth,
    height: videoH + chromeHeight,
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
