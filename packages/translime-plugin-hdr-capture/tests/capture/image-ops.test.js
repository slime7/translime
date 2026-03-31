import {
  describe, expect, it,
} from 'vitest';
import {
  applyAnnotationSteps,
  applyOverlay,
} from '../../src/capture/image-ops';

describe('image-ops', () => {
  it('应按步骤顺序应用马赛克与叠加层', () => {
    const base = Buffer.from([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 0, 255,
    ]);

    const overlay = {
      width: 2,
      height: 2,
      buffer: Uint8Array.from([
        0, 0, 0, 0,
        10, 20, 30, 255,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ]),
    };

    applyAnnotationSteps(base, 2, 2, [
      {
        type: 'mosaic',
        region: {
          x: 0, y: 0, w: 2, h: 2, mode: 'pixelate', blockSize: 2,
        },
      },
      {
        type: 'overlay',
        overlayData: overlay,
      },
    ], 1);

    expect(Array.from(base)).toEqual([
      128, 128, 64, 255,
      10, 20, 30, 255,
      128, 128, 64, 255,
      128, 128, 64, 255,
    ]);
  });

  it('叠加层应按 alpha 正确混合', () => {
    const dst = Buffer.from([100, 100, 100, 255]);

    applyOverlay(dst, 1, 1, {
      width: 1,
      height: 1,
      buffer: Uint8Array.from([200, 0, 0, 128]),
    }, 1);

    expect(Array.from(dst)).toEqual([150, 50, 50, 255]);
  });
});
