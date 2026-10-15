import { describe, expect, it } from 'vitest';
import { calculateProportionalSize, computeWindowSize, fitVideoRect } from '../src/window-size';

const TITLE_BAR_HEIGHT = 32;
const TOOLBAR_WIDTH = 88;
const BORDER = 8;
const GAP = 16;
const WORK_AREA = { width: 1920, height: 1040 };

describe('computeWindowSize', () => {
  it('竖屏设备按工作区可用画面等比缩放，窗口尺寸包含标题栏、工具栏、双侧边框与呼吸间距（防止初始窗口超出屏幕或比例错位）', () => {
    const size = computeWindowSize({
      resolution: { width: 1080, height: 2400 },
      workArea: WORK_AREA,
      toolbarCssWidth: TOOLBAR_WIDTH,
      titleBarCssHeight: TITLE_BAR_HEIGHT,
      borderCss: BORDER,
      gapCss: GAP,
    });
    // chromeW = 24 + 136 = 160, chromeH = 12 + 32 + 16 + 8 + 24 = 92
    // maxH = 1040 - 64 - 92 = 884, maxW = 1920 - 64 - 160 = 1696
    // videoW = 884 * 1080 / 2400 = 397.8 -> 398
    // width = 398 + 160 = 558, height = 884 + 92 = 976
    expect(size).toEqual({ width: 558, height: 976 });
  });

  it('宽屏设备画面受限于工作区宽度限制，高度等比反推（防止宽屏设备弹窗溢出显示器）', () => {
    const size = computeWindowSize({
      resolution: { width: 3840, height: 2160 },
      workArea: { width: 1000, height: 900 },
      toolbarCssWidth: TOOLBAR_WIDTH,
      titleBarCssHeight: TITLE_BAR_HEIGHT,
      borderCss: BORDER,
      gapCss: GAP,
      margin: 0,
    });
    // chromeW = 160, chromeH = 92
    // maxW = 1000 - 160 = 840, maxH = 900 - 92 = 808
    // videoW = 840, videoH = 840 * 2160 / 3840 = 472.5 -> 473
    // width = 840 + 160 = 1000, height = 473 + 92 = 565
    expect(size).toEqual({ width: 1000, height: 565 });
  });

  it('虚拟屏模式下无工具栏与边框间距，无底部控制条，仅按标题栏尺寸计算（防止虚拟屏窗口尺寸偏差与滚动条出现）', () => {
    const size = computeWindowSize({
      resolution: { width: 1080, height: 2400 },
      workArea: WORK_AREA,
      titleBarCssHeight: TITLE_BAR_HEIGHT,
      barCssHeight: 0,
    });
    // chromeW = 0, chromeH = 32
    // maxH = 1040 - 64 - 32 = 944
    // videoW = 944 * 1080 / 2400 = 424.8 -> 425
    // width = 425, height = 944 + 32 = 976
    expect(size).toEqual({ width: 425, height: 976 });
  });

  it('极端小工作区下不低于最小画面可用尺寸（防止小分辨率屏幕下窗口坍缩为负值或不可见）', () => {
    const size = computeWindowSize({
      resolution: { width: 1080, height: 2400 },
      workArea: { width: 200, height: 200 },
      toolbarCssWidth: TOOLBAR_WIDTH,
      titleBarCssHeight: TITLE_BAR_HEIGHT,
      borderCss: BORDER,
      gapCss: GAP,
    });
    expect(size.width).toBeGreaterThanOrEqual(240 + 160);
    expect(size.height).toBeGreaterThanOrEqual(320 + 92);
  });

  it('分辨率缺失时安全回退默认手机比例（防止 adb 未响应时抛错中断窗口创建）', () => {
    const size = computeWindowSize({
      resolution: null,
      workArea: WORK_AREA,
      toolbarCssWidth: TOOLBAR_WIDTH,
      titleBarCssHeight: TITLE_BAR_HEIGHT,
      borderCss: BORDER,
      gapCss: GAP,
    });
    expect(size.width).toBe(558);
    expect(size.height).toBe(976);
  });
});

describe('calculateProportionalSize', () => {
  const chromeWidth = 160;
  const chromeHeight = 92;
  const ratio = 1080 / 2400; // 0.45

  it('横向拖拽时以宽度为主导驱动高度等比变化（防止用户横向拖动边框时画面产生上下黑边）', () => {
    const result = calculateProportionalSize({
      targetWidth: 560,
      targetHeight: 800,
      currentWidth: 400,
      currentHeight: 700,
      ratio,
      chromeWidth,
      chromeHeight,
      edge: 'right',
    });
    // videoW = 560 - 160 = 400, videoH = round(400 / 0.45) = 889
    // width = 560, height = 889 + 92 = 981
    expect(result).toEqual({ width: 560, height: 981 });
    const videoRatio = (result.width - chromeWidth) / (result.height - chromeHeight);
    expect(Math.abs(videoRatio - ratio) / ratio).toBeLessThan(0.001);
  });

  it('纵向拖拽时以高度为主导驱动宽度等比变化（防止用户纵向拖动边框时画面产生左右黑边）', () => {
    const result = calculateProportionalSize({
      targetWidth: 600,
      targetHeight: 1000,
      currentWidth: 400,
      currentHeight: 700,
      ratio,
      chromeWidth,
      chromeHeight,
      edge: 'bottom',
    });
    // videoH = 1000 - 92 = 908, videoW = round(908 * 0.45) = 409
    // width = 409 + 160 = 569, height = 1000
    expect(result).toEqual({ width: 569, height: 1000 });
    const videoRatio = (result.width - chromeWidth) / (result.height - chromeHeight);
    expect(Math.abs(videoRatio - ratio) / ratio).toBeLessThan(0.001);
  });

  it('对角拖拽时按位移变化主导侧驱动等比计算（防止角部拖拽缩放时出现跳变或死锁）', () => {
    const result = calculateProportionalSize({
      targetWidth: 536,
      targetHeight: 750,
      currentWidth: 400,
      currentHeight: 700,
      ratio,
      chromeWidth,
      chromeHeight,
      edge: 'bottom-right',
    });
    expect(result.width).toBe(536);
    expect(result.height).toBeGreaterThan(700);
  });

  it('缩小至小于最小安全尺寸时截断到最小安全尺寸（防止窗口缩至无法交互）', () => {
    const result = calculateProportionalSize({
      targetWidth: 100,
      targetHeight: 100,
      currentWidth: 400,
      currentHeight: 700,
      ratio,
      chromeWidth,
      chromeHeight,
      edge: 'bottom-right',
    });
    expect(result.width).toBeGreaterThanOrEqual(240 + chromeWidth);
    expect(result.height).toBeGreaterThanOrEqual(320 + chromeHeight);
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

  it('竖屏画面按高度等比缩放并水平居中', () => {
    const rect = fitVideoRect({
      areaWidth: 900,
      areaHeight: 1000,
      aspect: { width: 1080, height: 2400 },
    });
    expect(rect).toEqual({
      x: 225, y: 0, width: 450, height: 1000,
    });
  });

  it('极端小区域返回至少 1px 的安全矩形', () => {
    const rect = fitVideoRect({ areaWidth: 0, areaHeight: 0, aspect: { width: 1080, height: 2400 } });
    expect(rect.width).toBeGreaterThanOrEqual(1);
    expect(rect.height).toBeGreaterThanOrEqual(1);
  });
});
