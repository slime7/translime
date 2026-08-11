import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import {
  getWindowControlsOverlaySize,
  syncWindowControlsOverlay,
  watchWindowControlsOverlay,
  WINDOW_CONTROLS_OVERLAY_FALLBACK,
} from '@/utils/windowControlsOverlay';

const setWco = (value) => {
  Object.defineProperty(navigator, 'windowControlsOverlay', {
    configurable: true,
    value,
  });
};

describe('windowControlsOverlay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setWco(undefined);
    document.documentElement.style.removeProperty('--title-bar-height');
    document.documentElement.style.removeProperty('--window-control-width');
  });

  it('无 WCO API 时读取尺寸返回 null', () => {
    expect(getWindowControlsOverlaySize()).toBeNull();
  });

  it('无 WCO API 时同步回退默认尺寸', () => {
    const size = syncWindowControlsOverlay();

    expect(size).toEqual(WINDOW_CONTROLS_OVERLAY_FALLBACK);
    expect(document.documentElement.style.getPropertyValue('--title-bar-height')).toBe('32px');
    expect(document.documentElement.style.getPropertyValue('--window-control-width')).toBe('138px');
  });

  it('有 WCO API 时写入实测尺寸', () => {
    setWco({
      getTitlebarAreaRect: () => ({ height: 40, width: 150 }),
    });

    const size = syncWindowControlsOverlay();

    expect(size).toEqual({ height: 40, width: 150 });
    expect(document.documentElement.style.getPropertyValue('--title-bar-height')).toBe('40px');
    expect(document.documentElement.style.getPropertyValue('--window-control-width')).toBe('150px');
  });

  it('watch 注册 geometrychange 监听并返回清理函数', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    setWco({
      getTitlebarAreaRect: () => ({ height: 32, width: 138 }),
      addEventListener,
      removeEventListener,
    });

    const stop = watchWindowControlsOverlay();

    expect(addEventListener).toHaveBeenCalledWith('geometrychange', expect.any(Function));
    stop();
    expect(removeEventListener).toHaveBeenCalledWith('geometrychange', expect.any(Function));
  });
});
