import { describe, expect, it } from 'vitest';
import {
  getChromeMetrics,
  resolveMirrorToolbarLayout,
  TOOLBAR_LAYOUT_BOTTOM,
  TOOLBAR_LAYOUT_SIDE,
} from '../src/mirror-layout';

describe('resolveMirrorToolbarLayout', () => {
  it('竖屏手机保持右侧工具栏布局（防止竖屏镜像窗口两侧被工具栏挤占）', () => {
    // 20:9 与 16:9 竖屏手机
    expect(resolveMirrorToolbarLayout({ width: 1080, height: 2400 })).toBe(TOOLBAR_LAYOUT_SIDE);
    expect(resolveMirrorToolbarLayout({ width: 1080, height: 1920 })).toBe(TOOLBAR_LAYOUT_SIDE);
  });

  it('平板（含竖屏 4:3）与横屏手机改为底部工具栏布局', () => {
    expect(resolveMirrorToolbarLayout({ width: 1536, height: 2048 })).toBe(TOOLBAR_LAYOUT_BOTTOM);
    expect(resolveMirrorToolbarLayout({ width: 2400, height: 1080 })).toBe(TOOLBAR_LAYOUT_BOTTOM);
    expect(resolveMirrorToolbarLayout({ width: 1920, height: 1200 })).toBe(TOOLBAR_LAYOUT_BOTTOM);
  });

  it('分辨率缺失或非法时按竖屏手机处理（防止占位窗口阶段误判宽屏）', () => {
    expect(resolveMirrorToolbarLayout(null)).toBe(TOOLBAR_LAYOUT_SIDE);
    expect(resolveMirrorToolbarLayout(undefined)).toBe(TOOLBAR_LAYOUT_SIDE);
    expect(resolveMirrorToolbarLayout({ width: 0, height: 0 })).toBe(TOOLBAR_LAYOUT_SIDE);
    expect(resolveMirrorToolbarLayout({ width: -1, height: 100 })).toBe(TOOLBAR_LAYOUT_SIDE);
  });
});

describe('getChromeMetrics', () => {
  it('右侧布局：工具栏条带占用右侧，左右不对称（防止回归右侧条带宽度口径）', () => {
    const m = getChromeMetrics('mirror', TOOLBAR_LAYOUT_SIDE);
    expect(m.leftOffset).toBe(24);
    expect(m.rightOffset).toBe(104);
    expect(m.topOffset).toBe(64);
    expect(m.bottomOffset).toBe(24);
    expect(m.chromeWidth).toBe(128);
    expect(m.chromeHeight).toBe(88);
  });

  it('底部布局：条带转移到高度且左右对称（防止平板/横屏镜像窗口两侧过宽）', () => {
    const m = getChromeMetrics('mirror', TOOLBAR_LAYOUT_BOTTOM);
    expect(m.leftOffset).toBe(24);
    expect(m.rightOffset).toBe(24);
    expect(m.topOffset).toBe(64);
    expect(m.bottomOffset).toBe(104);
    expect(m.chromeWidth).toBe(48);
    expect(m.chromeHeight).toBe(168);
  });

  it('虚拟屏模式只保留原生标题栏高度（防止工具栏布局影响虚拟屏窗口）', () => {
    expect(getChromeMetrics('virtual', TOOLBAR_LAYOUT_BOTTOM)).toEqual(getChromeMetrics('virtual'));
    expect(getChromeMetrics('virtual').topOffset).toBe(32);
  });
});
