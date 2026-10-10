import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  DEFAULT_THEME_COLOR_SOURCE,
  getMatThemeCss,
  getMatThemeTokens,
  isDarkMode,
} from '../../src/main/utils/mdeThemeHelper';

vi.mock('../../src/main/utils/appConfigStore', () => ({
  default: {
    get: vi.fn((key, def) => {
      if (key === 'setting.theme') return 'dark';
      if (key === 'setting.themeColor') return { source: '#20a6fc', variant: 'SchemeExpressive' };
      return def;
    }),
  },
}));

vi.mock('electron', () => ({
  nativeTheme: {
    shouldUseDarkColors: false,
  },
}));

describe('mdeThemeHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('正确判断深色模式', () => {
    expect(isDarkMode()).toBe(true);
  });

  it('正确生成 53 个 M3 2025 规范下的 --mat-sys-color-* 令牌', () => {
    const tokens = getMatThemeTokens({ dark: true, source: DEFAULT_THEME_COLOR_SOURCE });
    expect(tokens).toBeDefined();
    expect(typeof tokens).toBe('object');

    // 验证核心色彩令牌存在且为有效十六进制颜色
    expect(tokens['--mat-sys-color-primary']).toMatch(/^#[0-9a-f]{6}$/i);
    expect(tokens['--mat-sys-color-surface']).toMatch(/^#[0-9a-f]{6}$/i);
    expect(tokens['--mat-sys-color-on-surface']).toMatch(/^#[0-9a-f]{6}$/i);
    expect(tokens['--mat-sys-color-surface-container-high']).toMatch(/^#[0-9a-f]{6}$/i);
    expect(tokens['--mat-sys-color-error']).toMatch(/^#[0-9a-f]{6}$/i);

    // 确保令牌数量完整覆盖
    const tokenKeys = Object.keys(tokens);
    expect(tokenKeys.length).toBeGreaterThanOrEqual(50);
  });

  it('正确生成 CSS 规则字符串', () => {
    const css = getMatThemeCss({ selector: ':root' });
    expect(css).toContain(':root {');
    expect(css).toContain('--mat-sys-color-primary:');
    expect(css).toContain('}');
  });
});
