import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  getTitleBarHeight,
  TITLE_BAR_HEIGHT_FALLBACK,
} from '@/hooks/useTitleBarHeight';

const setWco = (value) => {
  Object.defineProperty(navigator, 'windowControlsOverlay', {
    configurable: true,
    value,
  });
};

describe('getTitleBarHeight', () => {
  afterEach(() => {
    setWco(undefined);
  });

  it('无 WCO API 时回退到 32', () => {
    expect(getTitleBarHeight()).toBe(TITLE_BAR_HEIGHT_FALLBACK);
  });

  it('启动竞态 rect 为 0 时回退到 32', () => {
    setWco({ getTitlebarAreaRect: () => ({ height: 0, width: 0 }) });
    expect(getTitleBarHeight()).toBe(TITLE_BAR_HEIGHT_FALLBACK);
  });

  it('实测值小于 20 时回退到 32', () => {
    setWco({ getTitlebarAreaRect: () => ({ height: 19, width: 138 }) });
    expect(getTitleBarHeight()).toBe(TITLE_BAR_HEIGHT_FALLBACK);
  });

  it('实测值等于 20 时保留原值', () => {
    setWco({ getTitlebarAreaRect: () => ({ height: 20, width: 138 }) });
    expect(getTitleBarHeight()).toBe(20);
  });

  it('最大化等场景实测值 23 时使用实测值', () => {
    setWco({ getTitlebarAreaRect: () => ({ height: 23, width: 138 }) });
    expect(getTitleBarHeight()).toBe(23);
  });

  it('实测值大于等于 20 时使用实测值', () => {
    setWco({ getTitlebarAreaRect: () => ({ height: 31, width: 138 }) });
    expect(getTitleBarHeight()).toBe(31);

    setWco({ getTitlebarAreaRect: () => ({ height: 40, width: 138 }) });
    expect(getTitleBarHeight()).toBe(40);
  });
});
