import { createRequire } from 'node:module';
import { useLogger } from 'translime-sdk';
import dayjs from 'dayjs';

const require = createRequire(import.meta.url);
const PLUGIN_ID = 'translime-plugin-hdr-capture';
const baseLogger = useLogger();
const logger = baseLogger.child ? baseLogger.child({ plugin_id: PLUGIN_ID, context: 'Capture' }) : baseLogger;

/**
 * 对 RGBA Buffer 应用圆角遮罩
 * @param {Buffer} buffer - RGBA 图像数据
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 * @param {number} radius - 圆角半径 (像素)
 */

function applyBorderRadius(buffer, width, height, radius) {
  if (radius <= 0) return;

  // 限制半径不超过最小边的一半
  const r = Math.min(radius, Math.floor(width / 2), Math.floor(height / 2));
  if (r <= 0) return;

  // 检查像素是否在圆角外 (相对于圆心)
  // 如果 dist > r，则在外侧 -> 透明
  // 如果 dist 在 r-0.5 到 r+0.5 之间 -> 抗锯齿 alpha
  const processPixel = (x, y, cx, cy) => {
    const distSq = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
    // 快速检查
    if (distSq < (r - 1) ** 2) return; // 肯定在圆内

    const dist = Math.sqrt(distSq);
    const offset = (y * width + x) * 4;

    if (dist > r + 0.5) {
      // 完全透明
      // eslint-disable-next-line no-param-reassign
      buffer[offset + 3] = 0;
    } else if (dist > r - 0.5) {
      // 边缘抗锯齿
      const alpha = 1 - (dist - (r - 0.5));
      // eslint-disable-next-line no-param-reassign
      buffer[offset + 3] = Math.round(buffer[offset + 3] * alpha);
    }
  };

  // 左上
  for (let y = 0; y < r; y += 1) {
    for (let x = 0; x < r; x += 1) {
      processPixel(x, y, r, r);
    }
  }

  // 右上
  for (let y = 0; y < r; y += 1) {
    for (let x = width - r; x < width; x += 1) {
      processPixel(x, y, width - r, r);
    }
  }

  // 左下
  for (let y = height - r; y < height; y += 1) {
    for (let x = 0; x < r; x += 1) {
      processPixel(x, y, r, height - r);
    }
  }

  // 右下
  for (let y = height - r; y < height; y += 1) {
    for (let x = width - r; x < width; x += 1) {
      processPixel(x, y, width - r, height - r);
    }
  }
}

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
    resizeImage: () => { throw new Error('Native addon not loaded'); },
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
export const getWindowAtPoint = (x, y, ignoreHandle = null) => nativeAddon.getWindowAtPoint(x, y, ignoreHandle);

/**
 * 获取所有显示器信息
 * @returns {DisplayInfo[]}
 */
export const getDisplays = () => nativeAddon.getDisplays();

/**
 * 捕获指定显示器的屏幕
 * @param {number} displayId - 显示器 ID
 * @param {Object} [hdrOptions] - HDR 映射选项
 * @param {boolean} [hdrOptions.enabled] - 是否启用自定义 HDR 映射
 * @param {number} [hdrOptions.sdrWhiteNits] - SDR 白点亮度 (nits)
 * @param {number} [hdrOptions.hdrMaxNits] - HDR 峰值亮度 (nits)
 * @param {boolean} [hdrOptions.preserveRaw] - 是否保留原始 HDR 数据
 * @returns {Promise<{buffer: Buffer, width: number, height: number, isHdr: boolean, rawHdrBuffer?: Buffer}>} 图像数据与实际尺寸
 */
export const captureDisplay = async (displayId = 0, hdrOptions = null) => {
  try {
    // 转换 HDR 选项
    const nativeHdrOptions = hdrOptions ? {
      enabled: hdrOptions.enabled,
      sdrWhiteNits: hdrOptions.sdrWhiteNits,
      hdrMaxNits: hdrOptions.hdrMaxNits,
      preserveRaw: hdrOptions.preserveRaw,
    } : null;
    return await nativeAddon.captureDisplay(displayId, nativeHdrOptions);
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
 * 调整图像大小
 * @param {Buffer} buffer - RGBA 图像数据
 * @param {number} width - 原图宽度
 * @param {number} height - 原图高度
 * @param {number} newWidth - 新宽度
 * @param {number} newHeight - 新高度
 * @returns {Buffer} 调整后的 RGBA 数据
 */
export const resizeImage = async (buffer, width, height, newWidth, newHeight) => nativeAddon.resizeImage(buffer, width, height, newWidth, newHeight);

/**
 * 将原始 HDR F16 数据编码为 EXR 格式
 * @param {Buffer} rawBuffer - RGBA F16 原始 HDR 数据 (每像素 8 字节)
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 * @returns {Promise<Buffer>} EXR 文件字节流
 */
export const encodeHdrToExr = async (rawBuffer, width, height) => {
  try {
    return await nativeAddon.encodeHdrToExr(rawBuffer, width, height);
  } catch (e) {
    logger.error('encodeHdrToExr 失败:', e);
    throw e;
  }
};

/**
 * 裁剪 HDR F16 格式的原始数据
 * @param {Buffer} rawBuffer - RGBA F16 原始 HDR 数据 (每像素 8 字节)
 * @param {number} width - 原图宽度
 * @param {number} height - 原图高度
 * @param {Rect} rect - 裁剪区域
 * @returns {Promise<Buffer>} 裁剪后的 RGBA F16 数据
 */
export const cropHdrF16 = async (rawBuffer, width, height, rect) => {
  try {
    return await nativeAddon.cropHdrF16(rawBuffer, width, height, rect);
  } catch (e) {
    logger.error('cropHdrF16 失败:', e);
    throw e;
  }
};

/**
 * 从缓存中裁剪并获取 PNG Buffer (用于复制)
 * @param {Array} sessionData - 捕获会话数据
 * @param {Rect} rect - 裁剪区域
 */
export const cropAndGetPngFromBuffer = async (sessionData, rect) => {
  logger.info('开始多屏幕混合裁剪, 选区:', { rect });

  if (!sessionData || sessionData.length === 0) {
    logger.error('裁剪失败: sessionData 为空！');
    throw new Error('截屏会话数据为空，请重启截图。');
  }

  // 找出所有包含选区部分的显示器，并计算重叠面积
  const overlaps = sessionData.map((d) => {
    const x = Math.max(rect.x, d.bounds.x);
    const y = Math.max(rect.y, d.bounds.y);
    const w = Math.min(rect.x + rect.width, d.bounds.x + d.bounds.width) - x;
    const h = Math.min(rect.y + rect.height, d.bounds.y + d.bounds.height) - y;
    if (w > 0 && h > 0) {
      return {
        display: d,
        inter: {
          x, y, width: w, height: h,
        },
        area: w * h,
      };
    }
    return null;
  }).filter(Boolean);

  if (overlaps.length === 0) {
    logger.error('裁剪失败: 无法匹配到任何显示器选区。');
    throw new Error('选区超出了显示范围。');
  }

  // 确定目标比例 (采用重叠面积最大的显示器的缩放率，保证大部分内容的清晰度)
  overlaps.sort((a, b) => b.area - a.area);
  const targetScale = overlaps[0].display.scaleFactor || 1.0;
  const targetWidth = Math.round(rect.width * targetScale);
  const targetHeight = Math.round(rect.height * targetScale);

  logger.info(`目标比例: ${targetScale}, 物理尺寸: ${targetWidth}x${targetHeight}, 涉及屏幕数: ${overlaps.length}`);

  // 创建目标 Buffer (初始透明)
  const finalBuffer = Buffer.alloc(targetWidth * targetHeight * 4);

  // 并行处理所有屏幕的裁剪和缩放，然后合并结果
  const processedChunks = await Promise.all(overlaps.map(async ({ display, inter }) => {
    const scale = display.scaleFactor || 1.0;

    // 计算该屏幕内的物理裁剪区域
    const srcRect = {
      x: Math.round((inter.x - display.bounds.x) * scale),
      y: Math.round((inter.y - display.bounds.y) * scale),
      width: Math.round(inter.width * scale),
      height: Math.round(inter.height * scale),
    };

    try {
      // 提取物理切片
      let chunk = await nativeAddon.cropImage(display.buffer, display.width, display.height, srcRect);
      let chunkWidth = srcRect.width;
      let chunkHeight = srcRect.height;

      // 如果该屏幕缩放率与目标缩放率不一致，需要进行物理缩放对齐
      if (Math.abs(scale - targetScale) > 0.01) {
        const resizedWidth = Math.round(inter.width * targetScale);
        const resizedHeight = Math.round(inter.height * targetScale);
        logger.info(`屏幕比例不一致 (${scale} vs ${targetScale}), 正在执行物理缩放: ${chunkWidth}x${chunkHeight} -> ${resizedWidth}x${resizedHeight}`);
        chunk = await nativeAddon.resizeImage(chunk, chunkWidth, chunkHeight, resizedWidth, resizedHeight);
        chunkWidth = resizedWidth;
        chunkHeight = resizedHeight;
      }

      // 计算目标偏移
      const destX = Math.round((inter.x - rect.x) * targetScale);
      const destY = Math.round((inter.y - rect.y) * targetScale);

      return {
        chunk, chunkWidth, chunkHeight, destX, destY, displayId: display.displayId,
      };
    } catch (e) {
      logger.error(`处理屏幕 ${display.displayId} 失败:`, e);
      return null;
    }
  }));

  // 将所有切片合并到目标 Buffer
  processedChunks.filter(Boolean).forEach(({
    chunk, chunkWidth, chunkHeight, destX, destY,
  }) => {
    for (let row = 0; row < chunkHeight; row += 1) {
      const targetRow = destY + row;
      if (targetRow >= targetHeight) {
        break;
      }

      const srcOffset = row * chunkWidth * 4;
      const destOffset = (targetRow * targetWidth + destX) * 4;
      const rowLength = Math.min(chunkWidth, targetWidth - destX) * 4;

      if (rowLength > 0 && destOffset + rowLength <= finalBuffer.length) {
        chunk.copy(finalBuffer, destOffset, srcOffset, srcOffset + rowLength);
      }
    }
  });

  // 应用圆角 (如果有)
  if (rect.borderRadius && rect.borderRadius > 0) {
    const radius = Math.round(rect.borderRadius * targetScale);
    applyBorderRadius(finalBuffer, targetWidth, targetHeight, radius);
  }

  try {
    const result = await encodeImage(finalBuffer, targetWidth, targetHeight, 'png');
    return result;
  } catch (err) {
    logger.error('后期处理过程发生错误:', err);
    throw err;
  }
};

/**
 * 保存裁剪后的图像，支持缩放和 HDR
 * @param {Array} sessionData - 捕获会话数据
 * @param {Object} rect - 裁剪区域
 * @param {Object} options - 保存选项
 * @param {string} options.format - 图像格式
 * @param {string} options.savePath - 保存路径
 * @param {string} [options.saveFilenameTemplate] - 保存文件名模板
 * @param {boolean} options.preserveHdr - 是否保存 HDR 原始文件
 */
export const cropAndSaveScaledFromBuffer = async (sessionData, rect, options = {}) => {
  const {
    format = 'png', savePath, preserveHdr = false, saveFilenameTemplate,
  } = options;

  logger.info('开始多屏幕混合裁剪并保存, 选区:', { data: { ...rect, preserveHdr } });

  // 找出所有重叠显示器
  const overlaps = sessionData.map((d) => {
    const x = Math.max(rect.x, d.bounds.x);
    const y = Math.max(rect.y, d.bounds.y);
    const w = Math.min(rect.x + rect.width, d.bounds.x + d.bounds.width) - x;
    const h = Math.min(rect.y + rect.height, d.bounds.y + d.bounds.height) - y;
    if (w > 0 && h > 0) {
      return {
        display: d,
        inter: {
          x, y, width: w, height: h,
        },
        area: w * h,
      };
    }
    return null;
  }).filter(Boolean);

  if (overlaps.length === 0) throw new Error('选区超出了显示范围。');

  // 目标比例
  overlaps.sort((a, b) => b.area - a.area);
  const targetScale = overlaps[0].display.scaleFactor || 1.0;
  const targetWidth = Math.round(rect.width * targetScale);
  const targetHeight = Math.round(rect.height * targetScale);

  const finalBuffer = Buffer.alloc(targetWidth * targetHeight * 4);

  // 并行处理所有屏幕的裁剪和缩放，然后合并结果
  const processedChunks = await Promise.all(overlaps.map(async ({ display, inter }) => {
    const scale = display.scaleFactor || 1.0;
    const srcRect = {
      x: Math.round((inter.x - display.bounds.x) * scale),
      y: Math.round((inter.y - display.bounds.y) * scale),
      width: Math.round(inter.width * scale),
      height: Math.round(inter.height * scale),
    };

    let chunk = await nativeAddon.cropImage(display.buffer, display.width, display.height, srcRect);
    let chunkWidth = srcRect.width;
    let chunkHeight = srcRect.height;

    if (Math.abs(scale - targetScale) > 0.01) {
      const resizedWidth = Math.round(inter.width * targetScale);
      const resizedHeight = Math.round(inter.height * targetScale);
      chunk = await nativeAddon.resizeImage(chunk, chunkWidth, chunkHeight, resizedWidth, resizedHeight);
      chunkWidth = resizedWidth;
      chunkHeight = resizedHeight;
    }

    const destX = Math.round((inter.x - rect.x) * targetScale);
    const destY = Math.round((inter.y - rect.y) * targetScale);

    return {
      chunk, chunkWidth, chunkHeight, destX, destY,
    };
  }));

  // 将所有切片合并到目标 Buffer
  processedChunks.forEach(({
    chunk, chunkWidth, chunkHeight, destX, destY,
  }) => {
    for (let row = 0; row < chunkHeight; row += 1) {
      const targetRow = destY + row;
      if (targetRow >= targetHeight) {
        break;
      }
      const srcOffset = row * chunkWidth * 4;
      const destOffset = (targetRow * targetWidth + destX) * 4;
      const rowLength = Math.min(chunkWidth, targetWidth - destX) * 4;
      if (rowLength > 0) {
        chunk.copy(finalBuffer, destOffset, srcOffset, srcOffset + rowLength);
      }
    }
  });

  // 应用圆角 (如果有)
  if (rect.borderRadius && rect.borderRadius > 0) {
    const radius = Math.round(rect.borderRadius * targetScale);
    applyBorderRadius(finalBuffer, targetWidth, targetHeight, radius);
  }

  // 后处理 - 直接编码，跳过 ToneMap 因为输入已经是 SDR
  const encodedData = await encodeImage(finalBuffer, targetWidth, targetHeight, format);

  if (savePath) {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const timestamp = dayjs().format('HDR_Capture_YYYY-MM-DD_HH-mm-ss');
    let fileName;

    if (saveFilenameTemplate) {
      try {
        fileName = `${dayjs().format(saveFilenameTemplate)}.${format}`;
      } catch (e) {
        logger.error('文件名模板格式化失败，回退到默认格式:', e);
        fileName = `HDR_Capture_${timestamp}.${format}`;
      }
    } else {
      fileName = `HDR_Capture_${timestamp}.${format}`;
    }

    const fullPath = path.join(savePath, fileName);
    await fs.writeFile(fullPath, encodedData);
    logger.info(`SDR 图像已保存: ${fullPath}`);

    // 如果启用了保存 HDR 原始文件，保存裁剪后的 HDR 数据为 EXR 格式
    if (preserveHdr) {
      // 检查是否有 HDR 屏幕且包含原始数据
      const hdrDisplays = overlaps.filter(({ display }) => display.isHdr && display.rawHdrBuffer);

      if (hdrDisplays.length > 0) {
        // 选取重叠面积最大的 HDR 屏幕作为主要来源
        const primaryHdr = hdrDisplays[0];
        const { display: hdrDisplay, inter } = primaryHdr;

        try {
          // 计算 HDR 原始数据中需要裁剪的物理区域
          const hdrScale = hdrDisplay.scaleFactor || 1.0;
          const hdrCropRect = {
            x: Math.round((inter.x - hdrDisplay.bounds.x) * hdrScale),
            y: Math.round((inter.y - hdrDisplay.bounds.y) * hdrScale),
            width: Math.round(inter.width * hdrScale),
            height: Math.round(inter.height * hdrScale),
          };

          logger.info('裁剪 HDR 原始数据:', {
            displaySize: `${hdrDisplay.width}x${hdrDisplay.height}`,
            cropRect: hdrCropRect,
          });

          // 裁剪 F16 格式的 HDR 原始数据
          const croppedHdrBuffer = await cropHdrF16(
            hdrDisplay.rawHdrBuffer,
            hdrDisplay.width,
            hdrDisplay.height,
            hdrCropRect,
          );

          // 使用裁剪后的尺寸编码为 EXR
          const exrData = await encodeHdrToExr(
            croppedHdrBuffer,
            hdrCropRect.width,
            hdrCropRect.height,
          );

          const exrFileName = fileName.replace(`.${format}`, '.exr');
          const exrFullPath = path.join(savePath, exrFileName);
          await fs.writeFile(exrFullPath, exrData);
          logger.info(`HDR EXR 文件已保存: ${exrFullPath} (${hdrCropRect.width}x${hdrCropRect.height}, ${exrData.length} bytes)`);
        } catch (exrError) {
          logger.error('HDR 裁剪/编码失败:', exrError);
          // 如果裁剪或 EXR 编码失败，回退到保存完整屏幕的原始字节
          const fallbackFileName = `HDR_Capture_${timestamp}_raw.bin`;
          const fallbackPath = path.join(savePath, fallbackFileName);

          const hdrDisplay2 = hdrDisplays[0].display;
          const metadata = {
            width: hdrDisplay2.width,
            height: hdrDisplay2.height,
            format: 'RGBA_F16',
            displayId: hdrDisplay2.displayId,
            timestamp,
            note: 'Fallback: full screen data, crop failed',
          };
          const metadataJson = JSON.stringify(metadata);
          const metadataBuffer = Buffer.from(metadataJson, 'utf-8');
          const headerLength = Buffer.alloc(4);
          headerLength.writeUInt32LE(metadataBuffer.length, 0);

          const combinedBuffer = Buffer.concat([
            headerLength,
            metadataBuffer,
            hdrDisplay2.rawHdrBuffer,
          ]);

          await fs.writeFile(fallbackPath, combinedBuffer);
          logger.info(`HDR 原始数据已保存 (fallback): ${fallbackPath}`);
        }
      } else {
        logger.info('未检测到 HDR 屏幕或原始 HDR 数据，跳过 HDR 原始文件保存');
      }
    }

    return fullPath;
  }
  return null;
};

