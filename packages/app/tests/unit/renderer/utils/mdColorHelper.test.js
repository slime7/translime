import {
  describe, expect, it,
} from 'vitest';
import {
  customColor,
  getReadableColors,
  getThemeStyles,
  getVuetifyColors,
  themeFromSourceColor,
} from '@/utils/mdColorHelper';

// Material Design 颜色工具测试
// 使用 Translime 的主题色作为测试源颜色
const TEST_SOURCE_COLOR = 0xFF20A6FC; // #20a6fc 的 ARGB 格式

describe('themeFromSourceColor', () => {
  it('应该从源颜色生成完整的主题对象', () => {
    const theme = themeFromSourceColor(TEST_SOURCE_COLOR);

    expect(theme).toHaveProperty('source');
    expect(theme).toHaveProperty('schemes');
    expect(theme).toHaveProperty('palettes');
    expect(theme.schemes).toHaveProperty('light');
    expect(theme.schemes).toHaveProperty('dark');
  });

  it('应该生成包含所有必需颜色 token 的配色方案', () => {
    const theme = themeFromSourceColor(TEST_SOURCE_COLOR);
    const requiredTokens = [
      'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
      'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
      'surface', 'onSurface', 'background', 'onBackground',
      'error', 'onError',
    ];

    requiredTokens.forEach((token) => {
      expect(theme.schemes.light).toHaveProperty(token);
      expect(theme.schemes.dark).toHaveProperty(token);
    });
  });

  it('应该支持不同的 variant 参数', () => {
    const variants = ['SchemeTonalSpot', 'SchemeMonochrome', 'SchemeNeutral'];

    variants.forEach((variant) => {
      const theme = themeFromSourceColor(TEST_SOURCE_COLOR, variant);
      expect(theme).toHaveProperty('schemes');
      expect(theme.schemes.light).toHaveProperty('primary');
    });
  });

  it('应该支持不同的 contrastLevel 参数', () => {
    const lowContrast = themeFromSourceColor(TEST_SOURCE_COLOR, 'SchemeTonalSpot', -1.0);
    const highContrast = themeFromSourceColor(TEST_SOURCE_COLOR, 'SchemeTonalSpot', 1.0);

    // 两个主题都应该有效
    expect(lowContrast.schemes.light).toHaveProperty('primary');
    expect(highContrast.schemes.light).toHaveProperty('primary');
  });

  it('应该支持自定义颜色', () => {
    const customColors = [
      { name: 'brand', value: 0xFFFF5722, blend: true },
    ];
    const theme = themeFromSourceColor(TEST_SOURCE_COLOR, 'SchemeTonalSpot', 0.0, customColors);

    expect(theme.customColors).toHaveLength(1);
    expect(theme.customColors[0]).toHaveProperty('color');
    expect(theme.customColors[0]).toHaveProperty('light');
    expect(theme.customColors[0]).toHaveProperty('dark');
  });
});

describe('customColor', () => {
  it('应该从源颜色生成自定义颜色组', () => {
    const color = { name: 'accent', value: 0xFFE91E63, blend: false };
    const result = customColor(TEST_SOURCE_COLOR, color);

    expect(result).toHaveProperty('color');
    expect(result).toHaveProperty('value');
    expect(result).toHaveProperty('light');
    expect(result).toHaveProperty('dark');
  });

  it('light 模式应该包含正确的颜色属性', () => {
    const color = { name: 'accent', value: 0xFFE91E63, blend: false };
    const result = customColor(TEST_SOURCE_COLOR, color);

    expect(result.light).toHaveProperty('color');
    expect(result.light).toHaveProperty('onColor');
    expect(result.light).toHaveProperty('colorContainer');
    expect(result.light).toHaveProperty('onColorContainer');
  });

  it('blend 选项应该影响输出颜色', () => {
    const colorNoBlend = { name: 'test', value: 0xFFFF0000, blend: false };
    const colorWithBlend = { name: 'test', value: 0xFFFF0000, blend: true };

    const resultNoBlend = customColor(TEST_SOURCE_COLOR, colorNoBlend);
    const resultWithBlend = customColor(TEST_SOURCE_COLOR, colorWithBlend);

    // blend 为 true 时，value 会被调和
    expect(resultNoBlend.value).toBe(0xFFFF0000);
    expect(resultWithBlend.value).not.toBe(resultNoBlend.value);
  });
});

describe('getReadableColors', () => {
  it('应该将 ARGB 颜色值转换为十六进制字符串', () => {
    const theme = themeFromSourceColor(TEST_SOURCE_COLOR);
    const readable = getReadableColors(theme);

    // source 应该是十六进制字符串
    expect(typeof readable.source).toBe('string');
    expect(readable.source).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('应该转换 schemes 中的所有颜色', () => {
    const theme = themeFromSourceColor(TEST_SOURCE_COLOR);
    const readable = getReadableColors(theme);

    // 检查 light scheme 中的颜色是否为十六进制字符串
    expect(typeof readable.schemes.light.primary).toBe('string');
    expect(readable.schemes.light.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('应该正确处理自定义颜色', () => {
    const customColors = [
      { name: 'brand', value: 0xFFFF5722, blend: false },
    ];
    const theme = themeFromSourceColor(TEST_SOURCE_COLOR, 'SchemeTonalSpot', 0.0, customColors);
    const readable = getReadableColors(theme);

    expect(readable.customColors).toHaveLength(1);
    expect(typeof readable.customColors[0].value).toBe('string');
  });
});

describe('getThemeStyles', () => {
  it('应该生成 CSS 变量样式对象', () => {
    const theme = themeFromSourceColor(TEST_SOURCE_COLOR);
    const styles = getThemeStyles(theme, { dark: false });

    // 应该包含 --md-color- 前缀的 CSS 变量
    const keys = Object.keys(styles);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => key.startsWith('--md-color-'))).toBe(true);
  });

  it('应该为 light 和 dark 模式生成不同的样式', () => {
    const theme = themeFromSourceColor(TEST_SOURCE_COLOR);
    const lightStyles = getThemeStyles(theme, { dark: false });
    const darkStyles = getThemeStyles(theme, { dark: true });

    // primary 颜色在 light 和 dark 模式下应该不同
    expect(lightStyles['--md-color-primary']).not.toBe(darkStyles['--md-color-primary']);
  });

  it('CSS 变量值应该是十六进制颜色字符串', () => {
    const theme = themeFromSourceColor(TEST_SOURCE_COLOR);
    const styles = getThemeStyles(theme, { dark: false });

    const values = Object.values(styles);
    values.forEach((value) => {
      expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });
});

describe('getVuetifyColors', () => {
  it('应该将 camelCase 键名转换为 kebab-case', () => {
    const theme = themeFromSourceColor(TEST_SOURCE_COLOR);
    const readable = getReadableColors(theme);
    const vuetifyColors = getVuetifyColors(readable);

    // 检查 kebab-case 格式
    expect(vuetifyColors.light).toHaveProperty('primary');
    expect(vuetifyColors.light).toHaveProperty('on-primary');
    expect(vuetifyColors.light).toHaveProperty('primary-container');
    expect(vuetifyColors.light).toHaveProperty('on-primary-container');
  });

  it('应该同时包含 light 和 dark 配色方案', () => {
    const theme = themeFromSourceColor(TEST_SOURCE_COLOR);
    const readable = getReadableColors(theme);
    const vuetifyColors = getVuetifyColors(readable);

    expect(vuetifyColors).toHaveProperty('light');
    expect(vuetifyColors).toHaveProperty('dark');
  });

  it('颜色值应该保持为十六进制字符串', () => {
    const theme = themeFromSourceColor(TEST_SOURCE_COLOR);
    const readable = getReadableColors(theme);
    const vuetifyColors = getVuetifyColors(readable);

    expect(vuetifyColors.light.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(vuetifyColors.dark.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
