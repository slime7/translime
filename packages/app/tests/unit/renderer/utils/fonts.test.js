import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

const loadFontModule = async () => {
  const module = await import('@/utils/fonts');
  return module.default;
};

const stubFontFaceSet = (implementation = {}) => {
  const fontFaceSet = {
    load: vi.fn(() => Promise.resolve([])),
    ready: Promise.resolve(),
    ...implementation,
  };
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: fontFaceSet,
  });
  return fontFaceSet;
};

describe('waitForCriticalFonts', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'fonts');
  });

  it('应显式触发图标字体加载并等待完成后兑现', async () => {
    const waitForCriticalFonts = await loadFontModule();
    const fontFaceSet = stubFontFaceSet();

    await expect(waitForCriticalFonts()).resolves.toBeUndefined();

    expect(fontFaceSet.load).toHaveBeenCalledWith('24px "Material Symbols Outlined"');
  });

  it('多次调用应共享同一次等待，不重复触发字体加载', async () => {
    const waitForCriticalFonts = await loadFontModule();
    const fontFaceSet = stubFontFaceSet();

    await Promise.all([waitForCriticalFonts(), waitForCriticalFonts()]);

    expect(fontFaceSet.load).toHaveBeenCalledTimes(1);
  });

  it('字体加载超时应按就绪处理，避免启动动画被永久卡住', async () => {
    vi.useFakeTimers();
    const waitForCriticalFonts = await loadFontModule();
    stubFontFaceSet({
      load: vi.fn(() => new Promise(() => {})),
      ready: new Promise(() => {}),
    });

    const task = waitForCriticalFonts(50);
    vi.advanceTimersByTime(51);

    await expect(task).resolves.toBeUndefined();
  });

  it('字体加载失败时应按就绪处理', async () => {
    const waitForCriticalFonts = await loadFontModule();
    stubFontFaceSet({
      load: vi.fn(() => Promise.reject(new Error('font boom'))),
    });

    await expect(waitForCriticalFonts()).resolves.toBeUndefined();
  });

  it('document.fonts 不可用时应直接兑现', async () => {
    const waitForCriticalFonts = await loadFontModule();
    Reflect.deleteProperty(document, 'fonts');

    await expect(waitForCriticalFonts()).resolves.toBeUndefined();
  });
});
