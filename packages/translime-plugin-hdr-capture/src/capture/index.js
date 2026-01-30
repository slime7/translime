import { createRequire } from 'node:module';
import { useLogger } from 'translime-sdk';

const require = createRequire(import.meta.url);
const PLUGIN_ID = 'translime-plugin-hdr-capture';
const baseLogger = useLogger();
const logger = baseLogger.child ? baseLogger.child({ plugin_id: PLUGIN_ID, context: 'Capture' }) : baseLogger;

// 加载 native addon
// NAPI-RS 生成的 index.js 已内置完整的跨平台加载逻辑
let nativeAddon;

try {
  // 使用 NAPI-RS 生成的加载器，自动处理平台/架构检测
  // eslint-disable-next-line import/no-unresolved, import/extensions
  nativeAddon = require('./bin/index.js');
} catch (e) {
  logger.error('无法加载 native addon:', e.message);
  logger.error('请先运行 pnpm run build:native 构建 Rust 模块');

  // 提供空实现，避免模块加载失败
  nativeAddon = {
    getTopLevelWindows: () => [],
    getWindowAtPoint: () => null,
    captureDisplay: () => { throw new Error('Native addon not loaded'); },
    getDisplays: () => [],
    cropImage: () => { throw new Error('Native addon not loaded'); },
    toneMap: () => { throw new Error('Native addon not loaded'); },
    encodeImage: () => { throw new Error('Native addon not loaded'); },
  };
}

/**
 * @typedef {Object} WindowInfo
 * @property {number} handle - 窗口句柄
 * @property {string} title - 窗口标题
 * @property {string} className - 窗口类名
 * @property {number} left - 左边界
 * @property {number} top - 上边界
 * @property {number} right - 右边界
 * @property {number} bottom - 下边界
 * @property {number} width - 宽度
 * @property {number} height - 高度
 */

/**
 * @typedef {Object} DisplayInfo
 * @property {number} id - 显示器 ID
 * @property {string} name - 显示器名称
 * @property {number} width - 宽度
 * @property {number} height - 高度
 * @property {boolean} isPrimary - 是否主显示器
 */

/**
 * @typedef {Object} Rect
 * @property {number} x - X 坐标
 * @property {number} y - Y 坐标
 * @property {number} width - 宽度
 * @property {number} height - 高度
 */

/**
 * 获取所有顶层窗口
 * @returns {WindowInfo[]}
 */
export const getTopLevelWindows = () => nativeAddon.getTopLevelWindows();

/**
 * 获取指定坐标处的窗口
 * @param {number} x - X 坐标
 * @param {number} y - Y 坐标
 * @returns {WindowInfo|null}
 */
export const getWindowAtPoint = (x, y) => nativeAddon.getWindowAtPoint(x, y);

/**
 * 获取所有显示器信息
 * @returns {DisplayInfo[]}
 */
export const getDisplays = () => nativeAddon.getDisplays();

/**
 * 捕获指定显示器的屏幕
 * @param {number} displayId - 显示器 ID
 * @returns {Promise<Buffer>} RGBA 格式的图像数据
 */
export const captureDisplay = async (displayId = 0) => {
  try {
    return await nativeAddon.captureDisplay(displayId);
  } catch (e) {
    logger.error(`captureDisplay 失败 (ID=${displayId}):`, e);
    throw e;
  }
};

/**
 * 裁剪图像
 * @param {Buffer} buffer - RGBA 图像数据
 * @param {number} width - 原图宽度
 * @param {number} height - 原图高度
 * @param {Rect} rect - 裁剪区域
 * @returns {Buffer} 裁剪后的 RGBA 数据
 */
export const cropImage = async (buffer, width, height, rect) => nativeAddon.cropImage(buffer, width, height, rect);

/**
 * HDR 到 SDR 的 Tone Mapping
 * @param {Buffer} hdrBuffer - HDR 图像数据
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 * @param {Object} [options] - 选项
 * @param {number} [options.exposure=1.0] - 曝光值
 * @param {boolean} [options.preserveHdrMetadata=false] - 是否保留 HDR 元数据
 * @returns {Buffer} SDR 图像数据
 */
export const toneMap = async (hdrBuffer, width, height, options = {}) => nativeAddon.toneMap(hdrBuffer, width, height, options);

/**
 * 编码图像为指定格式
 * @param {Buffer} buffer - RGBA 图像数据
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 * @param {string} format - 输出格式 (png, jpg, webp)
 * @returns {Buffer} 编码后的图像数据
 */
export const encodeImage = async (buffer, width, height, format = 'png') => nativeAddon.encodeImage(buffer, width, height, format);

/**
 * 从缓存中裁剪并获取 PNG Buffer (用于复制)
 * @param {Array} sessionData
 * @param {Rect} rect
 * @param {Object} options
 */
export const cropAndGetPngFromBuffer = async (sessionData, rect, options = {}) => {
  const { preserveHdr = false } = options;

  logger.info('开始裁剪, 选区:', rect);

  if (!sessionData || sessionData.length === 0) {
    logger.error('裁剪失败: sessionData 为空！');
    throw new Error('截屏会话数据为空，请重启截图。');
  }

  logger.info(`当前会话包含 ${sessionData.length} 个屏幕捕获记录`);
  sessionData.forEach((d, i) => {
    if (d && d.bounds) {
      logger.info(`  [${i}] 显示器 ID: ${d.displayId}, 边界: (${d.bounds.x}, ${d.bounds.y}, ${d.bounds.width}, ${d.bounds.height})`);
    } else {
      logger.warn(`  [${i}] 坏数据项:`, d);
    }
  });

  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  const display = sessionData.find((d) => {
    if (!d || !d.bounds) return false;
    const {
      x, y, width, height,
    } = d.bounds;
    return centerX >= x && centerX <= x + width && centerY >= y && centerY <= y + height;
  }) || sessionData[0];

  if (!display) {
    logger.error('裁剪失败: 无法定位到显示器且无默认回退');
    throw new Error('无法匹配到对应的显示器选区。');
  }

  logger.info('匹配到显示器:', display.displayId, '缩放率:', display.scaleFactor);

  // 关键：将逻辑坐标转换为物理像素
  const scale = display.scaleFactor || 1.0;
  const localRect = {
    x: Math.round((rect.x - display.bounds.x) * scale),
    y: Math.round((rect.y - display.bounds.y) * scale),
    width: Math.round(rect.width * scale),
    height: Math.round(rect.height * scale),
  };

  logger.info('物理像素转换结果:', localRect);

  try {
    const croppedBuffer = await cropImage(display.rawBuffer, display.width, display.height, localRect);
    logger.info('裁剪完成, Buffer 长度:', croppedBuffer?.length);

    let finalBuffer = croppedBuffer;
    if (preserveHdr) {
      logger.info('执行 ToneMapping...');
      finalBuffer = await toneMap(croppedBuffer, localRect.width, localRect.height, { preserveHdrMetadata: true });
    }

    logger.info('开始进行 PNG 编码...');
    const result = await encodeImage(finalBuffer, localRect.width, localRect.height, 'png');
    logger.info('编码完成');
    return result;
  } catch (err) {
    logger.error('核心处理过程发生错误:', err);
    throw err;
  }
};

/**
 * 优化 saveToBuffer 逻辑，支持缩放
 */
export const cropAndSaveScaledFromBuffer = async (sessionData, rect, options = {}) => {
  const { format = 'png', savePath, preserveHdr = false } = options;

  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const display = sessionData.find((d) => centerX >= d.bounds.x && centerX <= d.bounds.x + d.bounds.width
    && centerY >= d.bounds.y && centerY <= d.bounds.y + d.bounds.height) || sessionData[0];

  const scale = display.scaleFactor || 1.0;
  const localRect = {
    x: Math.round((rect.x - display.bounds.x) * scale),
    y: Math.round((rect.y - display.bounds.y) * scale),
    width: Math.round(rect.width * scale),
    height: Math.round(rect.height * scale),
  };

  const croppedBuffer = await cropImage(display.rawBuffer, display.width, display.height, localRect);

  let finalBuffer = croppedBuffer;
  if (preserveHdr) {
    finalBuffer = await toneMap(croppedBuffer, localRect.width, localRect.height, { preserveHdrMetadata: true });
  }

  const encodedData = await encodeImage(finalBuffer, localRect.width, localRect.height, format);

  if (savePath) {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const fileName = `HDR_Capture_${Date.now()}.${format}`;
    const fullPath = path.join(savePath, fileName);
    await fs.writeFile(fullPath, encodedData);
    return fullPath;
  }
  return null;
};

