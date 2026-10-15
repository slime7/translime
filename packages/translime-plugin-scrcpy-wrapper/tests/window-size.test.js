import { describe, expect, it } from 'vitest';
import computeWindowSize, { fitVideoRect } from '../src/window-size';

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

  it('标题栏高度叠加到内容高度', () => {
    const size = computeWindowSize({
      resolution: { width: 1080, height: 2400 },
      workArea: WORK_AREA,
      barCssHeight: BAR_HEIGHT,
      titleBarCssHeight: 32,
    });
    // 画面高 976 = 1040 - 64 边距，内容高 = 画面 + 底条 + 标题栏
    expect(size).toEqual({ width: 439, height: 976 + BAR_HEIGHT + 32 });
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

describe('fitVideoRect', () => {
  it('无 aspect 时铺满可用区域', () => {
    expect(fitVideoRect({ areaWidth: 800, areaHeight: 600, aspect: null })).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
  });

  it('竖屏画面按高度等比缩放并水平居中（letterbox）', () => {
    const rect = fitVideoRect({
      areaWidth: 900,
      areaHeight: 1000,
      aspect: { width: 1080, height: 2400 },
    });
    // 高度受限：h=1000，w=1000*1080/2400=450，水平居中留黑边
    expect(rect).toEqual({
      x: 225, y: 0, width: 450, height: 1000,
    });
  });

  it('宽屏区域按宽度等比缩放并垂直居中', () => {
    const rect = fitVideoRect({
      areaWidth: 1200,
      areaHeight: 500,
      aspect: { width: 2120, height: 3000 },
    });
    // 宽度受限：w=1200，h=1200*3000/2120≈1698 超出 → 改按高 500 → w≈353
    expect(rect.height).toBe(500);
    expect(rect.width).toBeLessThanOrEqual(1200);
    expect(rect.x).toBe(Math.round((1200 - rect.width) / 2));
    expect(rect.y).toBe(0);
  });

  it('极端小区域返回至少 1px 的安全矩形，不抛错', () => {
    const rect = fitVideoRect({ areaWidth: 0, areaHeight: 0, aspect: { width: 1080, height: 2400 } });
    expect(rect.width).toBeGreaterThanOrEqual(1);
    expect(rect.height).toBeGreaterThanOrEqual(1);
  });
});
