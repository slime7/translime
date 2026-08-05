/**
 * 对 RGBA Buffer 应用圆角遮罩。
 *
 * @param {Buffer} buffer - 待处理的 RGBA 图像数据。
 * @param {number} width - 图像宽度。
 * @param {number} height - 图像高度。
 * @param {number} radius - 圆角半径，单位为像素。
 * @returns {void}
 */
export function applyBorderRadius(buffer, width, height, radius) {
  const output = buffer;

  if (radius <= 0) {
    return;
  }

  const r = Math.min(radius, Math.floor(width / 2), Math.floor(height / 2));
  if (r <= 0) {
    return;
  }

  const processPixel = (x, y, cx, cy) => {
    const distSq = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
    if (distSq < (r - 1) ** 2) {
      return;
    }

    const dist = Math.sqrt(distSq);
    const offset = (y * width + x) * 4;

    if (dist > r + 0.5) {
      output[offset + 3] = 0;
    } else if (dist > r - 0.5) {
      const alpha = 1 - (dist - (r - 0.5));
      output[offset + 3] = Math.round(output[offset + 3] * alpha);
    }
  };

  for (let y = 0; y < r; y += 1) {
    for (let x = 0; x < r; x += 1) {
      processPixel(x, y, r, r);
    }
  }

  for (let y = 0; y < r; y += 1) {
    for (let x = width - r; x < width; x += 1) {
      processPixel(x, y, width - r, r);
    }
  }

  for (let y = height - r; y < height; y += 1) {
    for (let x = 0; x < r; x += 1) {
      processPixel(x, y, r, height - r);
    }
  }

  for (let y = height - r; y < height; y += 1) {
    for (let x = width - r; x < width; x += 1) {
      processPixel(x, y, width - r, height - r);
    }
  }
}

/**
 * 将叠加层像素数据按 alpha 混合方式合成到目标图像上。
 *
 * @param {Buffer} dstBuffer - 目标 RGBA 图像（物理尺寸）。
 * @param {number} dstWidth - 目标图像物理宽度。
 * @param {number} dstHeight - 目标图像物理高度。
 * @param {{ buffer: Buffer|Uint8Array, width: number, height: number }} overlayData - 叠加层数据（逻辑尺寸）。
 * @param {number} targetScale - 逻辑尺寸到物理尺寸的缩放倍率。
 * @returns {void}
 */
export function applyOverlay(dstBuffer, dstWidth, dstHeight, overlayData, targetScale) {
  const output = dstBuffer;
  const srcBuf = overlayData.buffer;
  const srcW = overlayData.width;
  const srcH = overlayData.height;

  for (let dy = 0; dy < dstHeight; dy += 1) {
    const sy = Math.floor(dy / targetScale);
    if (sy < srcH) {
      for (let dx = 0; dx < dstWidth; dx += 1) {
        const sx = Math.floor(dx / targetScale);
        if (sx < srcW) {
          const srcIdx = (sy * srcW + sx) * 4;
          const srcA = srcBuf[srcIdx + 3];

          if (srcA > 0) {
            const dstIdx = (dy * dstWidth + dx) * 4;
            const alpha = srcA / 255;
            const invAlpha = 1 - alpha;

            output[dstIdx] = Math.round(srcBuf[srcIdx] * alpha + output[dstIdx] * invAlpha);
            output[dstIdx + 1] = Math.round(srcBuf[srcIdx + 1] * alpha + output[dstIdx + 1] * invAlpha);
            output[dstIdx + 2] = Math.round(srcBuf[srcIdx + 2] * alpha + output[dstIdx + 2] * invAlpha);
            output[dstIdx + 3] = Math.min(255, Math.round(srcA + output[dstIdx + 3] * invAlpha));
          }
        }
      }
    }
  }
}

/**
 * 对指定区域执行像素化处理。
 *
 * @param {Buffer} buffer - RGBA 图像数据。
 * @param {number} bufWidth - 图像宽度。
 * @param {number} x0 - 区域左边界。
 * @param {number} y0 - 区域上边界。
 * @param {number} x1 - 区域右边界。
 * @param {number} y1 - 区域下边界。
 * @param {number} blockSize - 像素化方块大小。
 * @returns {void}
 */
export function applyPixelate(buffer, bufWidth, x0, y0, x1, y1, blockSize) {
  const output = buffer;

  for (let by = y0; by < y1; by += blockSize) {
    for (let bx = x0; bx < x1; bx += blockSize) {
      const bw = Math.min(blockSize, x1 - bx);
      const bh = Math.min(blockSize, y1 - by);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      for (let dy = 0; dy < bh; dy += 1) {
        for (let dx = 0; dx < bw; dx += 1) {
          const idx = ((by + dy) * bufWidth + (bx + dx)) * 4;
          r += buffer[idx];
          g += buffer[idx + 1];
          b += buffer[idx + 2];
          a += buffer[idx + 3];
          count += 1;
        }
      }

      if (count > 0) {
        const avgR = Math.round(r / count);
        const avgG = Math.round(g / count);
        const avgB = Math.round(b / count);
        const avgA = Math.round(a / count);

        for (let dy = 0; dy < bh; dy += 1) {
          for (let dx = 0; dx < bw; dx += 1) {
            const idx = ((by + dy) * bufWidth + (bx + dx)) * 4;
            output[idx] = avgR;
            output[idx + 1] = avgG;
            output[idx + 2] = avgB;
            output[idx + 3] = avgA;
          }
        }
      }
    }
  }
}

/**
 * 对指定区域执行三次分离式 Box Blur，近似高斯模糊效果。
 *
 * @param {Buffer} buffer - RGBA 图像数据。
 * @param {number} bufWidth - 图像宽度。
 * @param {number} bufHeight - 图像高度。
 * @param {number} x0 - 区域左边界。
 * @param {number} y0 - 区域上边界。
 * @param {number} x1 - 区域右边界。
 * @param {number} y1 - 区域下边界。
 * @param {number} radius - 模糊半径。
 * @returns {void}
 */
export function applyBoxBlur(buffer, bufWidth, bufHeight, x0, y0, x1, y1, radius) {
  const regionW = x1 - x0;
  const regionH = y1 - y0;
  const temp = Buffer.alloc(regionW * regionH * 4);

  for (let y = 0; y < regionH; y += 1) {
    const srcOffset = ((y0 + y) * bufWidth + x0) * 4;
    const dstOffset = y * regionW * 4;
    buffer.copy(temp, dstOffset, srcOffset, srcOffset + regionW * 4);
  }

  const out = Buffer.alloc(regionW * regionH * 4);

  for (let pass = 0; pass < 3; pass += 1) {
    const src = pass === 0 ? temp : out;

    for (let y = 0; y < regionH; y += 1) {
      for (let x = 0; x < regionW; x += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let count = 0;
        const kStart = Math.max(0, x - radius);
        const kEnd = Math.min(regionW - 1, x + radius);

        for (let k = kStart; k <= kEnd; k += 1) {
          const idx = (y * regionW + k) * 4;
          r += src[idx];
          g += src[idx + 1];
          b += src[idx + 2];
          a += src[idx + 3];
          count += 1;
        }

        const idx = (y * regionW + x) * 4;
        out[idx] = Math.round(r / count);
        out[idx + 1] = Math.round(g / count);
        out[idx + 2] = Math.round(b / count);
        out[idx + 3] = Math.round(a / count);
      }
    }

    out.copy(temp);

    for (let y = 0; y < regionH; y += 1) {
      for (let x = 0; x < regionW; x += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let count = 0;
        const kStart = Math.max(0, y - radius);
        const kEnd = Math.min(regionH - 1, y + radius);

        for (let k = kStart; k <= kEnd; k += 1) {
          const idx = (k * regionW + x) * 4;
          r += temp[idx];
          g += temp[idx + 1];
          b += temp[idx + 2];
          a += temp[idx + 3];
          count += 1;
        }

        const idx = (y * regionW + x) * 4;
        out[idx] = Math.round(r / count);
        out[idx + 1] = Math.round(g / count);
        out[idx + 2] = Math.round(b / count);
        out[idx + 3] = Math.round(a / count);
      }
    }

    if (pass < 2) {
      out.copy(temp);
    }
  }

  for (let y = 0; y < regionH; y += 1) {
    const srcOffset = y * regionW * 4;
    const dstOffset = ((y0 + y) * bufWidth + x0) * 4;
    out.copy(buffer, dstOffset, srcOffset, srcOffset + regionW * 4);
  }
}

/**
 * 对多个逻辑区域依次执行像素化或模糊处理。
 *
 * @param {Buffer} buffer - 目标 RGBA 图像（物理尺寸）。
 * @param {number} bufWidth - 图像物理宽度。
 * @param {number} bufHeight - 图像物理高度。
 * @param {Array<{ x: number, y: number, w: number, h: number, mode?: string, blockSize?: number }>} regions - 逻辑坐标区域列表。
 * @param {number} scale - 逻辑坐标到物理坐标的缩放倍率。
 * @returns {void}
 */
export function applyMosaic(buffer, bufWidth, bufHeight, regions, scale) {
  if (!regions || regions.length === 0) {
    return;
  }

  regions.forEach((region) => {
    const px = Math.round(region.x * scale);
    const py = Math.round(region.y * scale);
    const pw = Math.round(region.w * scale);
    const ph = Math.round(region.h * scale);
    const x0 = Math.max(0, px);
    const y0 = Math.max(0, py);
    const x1 = Math.min(bufWidth, px + pw);
    const y1 = Math.min(bufHeight, py + ph);

    if (x1 <= x0 || y1 <= y0) {
      return;
    }

    const blockSize = Math.max(1, Math.round((region.blockSize || 10) * scale));
    if (region.mode === 'blur') {
      applyBoxBlur(buffer, bufWidth, bufHeight, x0, y0, x1, y1, blockSize);
      return;
    }

    applyPixelate(buffer, bufWidth, x0, y0, x1, y1, blockSize);
  });
}

/**
 * 按历史顺序将标注步骤依次应用到目标图像。
 *
 * @param {Buffer} buffer - 目标 RGBA 图像（物理尺寸）。
 * @param {number} width - 图像物理宽度。
 * @param {number} height - 图像物理高度。
 * @param {Array<object>} annotationSteps - 已排序的标注步骤列表。
 * @param {number} targetScale - 逻辑尺寸到物理尺寸的缩放倍率。
 * @returns {void}
 */
export function applyAnnotationSteps(buffer, width, height, annotationSteps, targetScale) {
  if (!annotationSteps || annotationSteps.length === 0) {
    return;
  }

  annotationSteps.forEach((step) => {
    if (step.type === 'mosaic' && step.region) {
      applyMosaic(buffer, width, height, [step.region], targetScale);
      return;
    }

    if (step.type === 'overlay' && step.overlayData?.buffer) {
      const overlayBuf = Buffer.isBuffer(step.overlayData.buffer)
        ? step.overlayData.buffer
        : Buffer.from(step.overlayData.buffer);
      applyOverlay(buffer, width, height, {
        buffer: overlayBuf,
        width: step.overlayData.width,
        height: step.overlayData.height,
      }, targetScale);
    }
  });
}
