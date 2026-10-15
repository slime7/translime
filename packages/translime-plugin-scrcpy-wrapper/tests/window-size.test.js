import { describe, expect, it } from 'vitest';
import computeWindowSize from '../src/window-size';

const BAR_HEIGHT = 48;
const WORK_AREA = { width: 1920, height: 1040 };

describe('computeWindowSize', () => {
  it('竖屏设备按工作区高度等比缩放，高度叠加底条', () => {
    const size = computeWindowSize({
      resolution: { width: 1080, height: 2400 },
      workArea: WORK_AREA,
      barCssHeight: BAR_HEIGHT,
    });
    // 画面高 976 = 1040 - 64 边距，宽 976 * 1080 / 2400 ≈ 439
    expect(size).toEqual({ width: 439, height: 976 + BAR_HEIGHT });
  });

  it('画面宽超工作区时改为按宽度限制', () => {
    const size = computeWindowSize({
      resolution: { width: 3840, height: 2160 },
      workArea: { width: 1000, height: 900 },
      barCssHeight: BAR_HEIGHT,
      margin: 0,
    });
    // 宽受限于 1000，高 = 1000 * 2160 / 3840 = 562.5 未超高
    expect(size).toEqual({ width: 1000, height: 563 + BAR_HEIGHT });
  });

  it('小屏工作区不低于最小画面尺寸', () => {
    const size = computeWindowSize({
      resolution: { width: 1080, height: 2400 },
      workArea: { width: 200, height: 200 },
      barCssHeight: BAR_HEIGHT,
    });
    expect(size.width).toBeGreaterThanOrEqual(240);
    expect(size.height).toBeGreaterThan(BAR_HEIGHT);
  });

  it('分辨率缺失时回退常见手机比例，不抛错', () => {
    const size = computeWindowSize({
      resolution: null,
      workArea: WORK_AREA,
      barCssHeight: BAR_HEIGHT,
    });
    expect(size.height).toBeGreaterThan(BAR_HEIGHT);
    expect(size.width).toBeGreaterThan(0);
    // 回退比例 1080x2400 与显式传入时一致
    expect(size.width).toBe(439);
  });
});
