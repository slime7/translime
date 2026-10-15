/**
 * 画面窗口初始尺寸计算。
 *
 * 按设备屏幕分辨率等比缩放到显示器工作区内，
 * 窗口内容高度 = 画面高度 + 底部控制条高度。
 */

const FALLBACK_RESOLUTION = { width: 1080, height: 2400 };
const MIN_VIDEO_WIDTH = 240;
const MIN_VIDEO_HEIGHT = 320;

/**
 * 计算窗口内容尺寸（CSS 像素）。
 *
 * @param {object} options
 * @param {{ width: number, height: number } | null} options.resolution - 设备分辨率，缺失时用常见手机比例。
 * @param {{ width: number, height: number }} options.workArea - 目标显示器工作区（CSS 像素）。
 * @param {number} options.barCssHeight - 底部控制条 CSS 高度。
 * @param {number} [options.titleBarCssHeight=0] - 顶部自绘标题栏 CSS 高度。
 * @param {number} [options.margin=64] - 工作区四周预留的呼吸边距。
 * @returns {{ width: number, height: number }} BrowserWindow 内容尺寸。
 */
const computeWindowSize = ({
  resolution,
  workArea,
  barCssHeight,
  titleBarCssHeight = 0,
  margin = 64,
}) => {
  const device = resolution && resolution.width > 0 && resolution.height > 0
    ? resolution
    : FALLBACK_RESOLUTION;
  const ratio = device.width / device.height;

  const maxWidth = Math.max(MIN_VIDEO_WIDTH, workArea.width - margin);
  const maxHeight = Math.max(MIN_VIDEO_HEIGHT, workArea.height - margin);

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
    width: Math.round(videoWidth),
    height: Math.round(videoHeight + barCssHeight + titleBarCssHeight),
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
 * @param {number} options.areaHeight - 可用区域高（物理像素，已扣除底条）。
 * @param {{ width: number, height: number } | null} options.aspect - 设备分辨率。
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
const fitVideoRect = ({ areaWidth, areaHeight, aspect }) => {
  const safeW = Math.max(1, Math.round(areaWidth));
  const safeH = Math.max(1, Math.round(areaHeight));
  if (!aspect || !(aspect.width > 0) || !(aspect.height > 0) || safeW <= 1 || safeH <= 1) {
    return {
      x: 0, y: 0, width: safeW, height: safeH,
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
export { fitVideoRect };
