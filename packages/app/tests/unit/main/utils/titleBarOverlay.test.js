import {
  describe, expect, it,
} from 'vitest';
import {
  DEFAULT_SYMBOL_COLOR,
  DEFAULT_TITLE_BAR_OVERLAY_HEIGHT,
  resolveOverlayMode,
  resolveTitleBarOverlay,
  TITLE_BAR_OVERLAY_COLOR,
} from '@main/utils/titleBarOverlay';

describe('resolveOverlayMode', () => {
  it('显式 dark/light 优先于系统深浅色', () => {
    expect(resolveOverlayMode('dark', false)).toBe('dark');
    expect(resolveOverlayMode('light', true)).toBe('light');
  });

  it('system 模式跟随系统深浅色', () => {
    expect(resolveOverlayMode('system', true)).toBe('dark');
    expect(resolveOverlayMode('system', false)).toBe('light');
  });
});

describe('resolveTitleBarOverlay', () => {
  it('浅色模式使用默认浅色图标与透明背景', () => {
    expect(resolveTitleBarOverlay({ overlayMode: 'light' })).toEqual({
      height: DEFAULT_TITLE_BAR_OVERLAY_HEIGHT,
      color: TITLE_BAR_OVERLAY_COLOR,
      symbolColor: DEFAULT_SYMBOL_COLOR.light,
    });
  });

  it('深色模式使用默认深色图标', () => {
    const overlay = resolveTitleBarOverlay({ overlayMode: 'dark' });
    expect(overlay.symbolColor).toBe(DEFAULT_SYMBOL_COLOR.dark);
    expect(overlay.color).toBe(TITLE_BAR_OVERLAY_COLOR);
  });

  it('持久化配置优先于默认值', () => {
    const overlay = resolveTitleBarOverlay({
      overlayMode: 'dark',
      savedOverlay: { symbolColor: '#123456', height: 40 },
    });
    expect(overlay).toEqual({
      height: 40,
      color: TITLE_BAR_OVERLAY_COLOR,
      symbolColor: '#123456',
    });
  });

  it('空持久化配置回退默认值', () => {
    expect(resolveTitleBarOverlay({ overlayMode: 'dark', savedOverlay: undefined }).symbolColor)
      .toBe(DEFAULT_SYMBOL_COLOR.dark);
    expect(resolveTitleBarOverlay({ overlayMode: 'light', savedOverlay: {} }).symbolColor)
      .toBe(DEFAULT_SYMBOL_COLOR.light);
  });
});
