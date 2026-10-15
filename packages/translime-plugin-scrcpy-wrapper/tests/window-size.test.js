import { describe, expect, it } from 'vitest';
import { calculateProportionalSize, computeWindowSize, fitVideoRect } from '../src/window-size';

const TITLE_BAR_HEIGHT = 32;
const TOOLBAR_WIDTH = 88;
const BORDER = 8;
const GAP = 48;
const WORK_AREA = { width: 1920, height: 1040 };

describe('computeWindowSize', () => {
  it('竖屏设备按工作区可用画面等比缩放，窗口尺寸包含标题栏、工具栏、双侧边框与四周统一留白（防止初始窗口超出屏幕或比例错位）', () => {
    const size = computeWindowSize({
      resolution: { width: 1080, height: 2400 },
      workArea: WORK_AREA,
      toolbarCssWidth: TOOLBAR_WIDTH,
      titleBarCssHeight: TITLE_BAR_HEIGHT,
      borderCss: BORDER,
      gapCss: GAP,
    });
    // 标题栏悬浮于顶部留白内：chromeW = 56 + 168 = 224, chromeH = 56 + 56 = 112
    // maxH = 1040 - 64 - 112 = 864, maxW = 1920 - 64 - 224 = 1632
    // videoW = 864 * 1080 / 2400 = 388.8
    // width = 388.8 + 224 = 612.8 -> 613, height = 864 + 112 = 976
    expect(size).toEqual({ width: 613, height: 976 });
  });

  it('留白容不下标题栏时标题栏额外占据顶部高度（防止小间距下标题栏与画面重叠）', () => {
    const size = computeWindowSize({
      resolution: { width: 1080, height: 2400 },
      workArea: WORK_AREA,
      toolbarCssWidth: TOOLBAR_WIDTH,
      titleBarCssHeight: TITLE_BAR_HEIGHT,
      borderCss: BORDER,
      gapCss: 16,
    });
    // 标题栏 32 > 留白 16，额外占高：chromeH = (32 + 16 + 8) + (16 + 8) = 80
    // maxH = 1040 - 64 - 80 = 896
    // videoW = 896 * 1080 / 2400 = 403.2 -> width = 403.2 + 160 = 563.2 -> 563
    // height = 896 + 80 = 976
    expect(size).toEqual({ width: 563, height: 976 });
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
    // chromeW = 224, chromeH = 112
    // maxW = 1000 - 224 = 776, maxH = 900 - 112 = 788
    // videoW = 788 * 3840 / 2160 = 1400.9 > 776 -> videoW = 776
    // videoH = 776 * 2160 / 3840 = 436.5 -> height = 436.5 + 112 = 548.5 -> 549
    expect(size).toEqual({ width: 1000, height: 549 });
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
    expect(size.width).toBeGreaterThanOrEqual(240 + 224);
    expect(size.height).toBeGreaterThanOrEqual(320 + 112);
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
    expect(size.width).toBe(613);
    expect(size.height).toBe(976);
  });
});

describe('calculateProportionalSize', () => {
  const chromeWidth = 224;
  const chromeHeight = 112;
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
    // videoW = 560 - 224 = 336, videoH = round(336 / 0.45) = 747
    // width = 560, height = 747 + 112 = 859
    expect(result).toEqual({ width: 560, height: 859 });
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
    // videoH = 1000 - 112 = 888, videoW = round(888 * 0.45) = 400
    // width = 400 + 224 = 624, height = 1000
    expect(result).toEqual({ width: 624, height: 1000 });
    const videoRatio = (result.width - chromeWidth) / (result.height - chromeHeight);
    // 容差与主进程 checkAndFixProportionalSize 的 0.5% 判定一致，容忍像素取整误差
    expect(Math.abs(videoRatio - ratio) / ratio).toBeLessThan(0.005);
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
