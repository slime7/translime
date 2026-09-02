import {
  describe, expect, it,
} from 'vitest';
import useMdColor from '@/hooks/useMdColor';

describe('useMdColor', () => {
  it('应该返回所需的方法', () => {
    const mdColor = useMdColor();

    expect(mdColor).toHaveProperty('getThemeColorFromColor');
    expect(mdColor).toHaveProperty('getThemeColorFromImage');
    expect(mdColor).toHaveProperty('getThemeCssVars');
    expect(mdColor).toHaveProperty('getVuetifyColors');
    expect(mdColor).toHaveProperty('argbToHex');
    expect(mdColor).toHaveProperty('hexToArgb');
  });

  describe('getThemeColorFromColor', () => {
    it('应该从十六进制颜色生成主题', () => {
      const { getThemeColorFromColor } = useMdColor();

      const theme = getThemeColorFromColor('#20a6fc');

      expect(theme).toHaveProperty('source');
      expect(theme).toHaveProperty('schemes');
      expect(theme.schemes).toHaveProperty('light');
      expect(theme.schemes).toHaveProperty('dark');
      expect(theme.schemes.light).toHaveProperty('primaryDim');
      expect(theme.schemes.dark).toHaveProperty('errorDim');
    });

    it('默认方案应该固定为 SchemeExpressive', () => {
      const { getThemeColorFromColor } = useMdColor();

      const defaultTheme = getThemeColorFromColor('#20a6fc');
      const expressiveTheme = getThemeColorFromColor('#20a6fc', 'SchemeExpressive');

      expect(defaultTheme.schemes).toEqual(expressiveTheme.schemes);
    });

    it('应该支持不同的 variant', () => {
      const { getThemeColorFromColor } = useMdColor();

      const theme = getThemeColorFromColor('#20a6fc', 'SchemeVibrant');

      expect(theme.schemes.light).toHaveProperty('primary');
    });

    it('所有颜色值应该是十六进制字符串', () => {
      const { getThemeColorFromColor } = useMdColor();

      const theme = getThemeColorFromColor('#20a6fc');

      expect(typeof theme.source).toBe('string');
      expect(theme.source).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(typeof theme.schemes.light.primary).toBe('string');
    });
  });

  describe('argbToHex / hexToArgb', () => {
    it('argbToHex 应该将 ARGB 转换为十六进制', () => {
      const { argbToHex } = useMdColor();

      const hex = argbToHex(0xFFFF5722);

      expect(hex).toBe('#ff5722');
    });

    it('hexToArgb 应该将十六进制转换为 ARGB', () => {
      const { hexToArgb } = useMdColor();

      const argb = hexToArgb('#ff5722');

      expect(argb).toBe(0xFFFF5722);
    });

    it('转换应该是可逆的', () => {
      const { argbToHex, hexToArgb } = useMdColor();
      const originalHex = '#20a6fc';

      const argb = hexToArgb(originalHex);
      const resultHex = argbToHex(argb);

      expect(resultHex).toBe(originalHex);
    });
  });

  describe('getThemeCssVars', () => {
    it('应该生成 CSS 变量对象', () => {
      const { getThemeColorFromColor, getThemeCssVars } = useMdColor();

      const theme = getThemeColorFromColor('#20a6fc');
      const cssVars = getThemeCssVars(theme, { dark: false });

      const keys = Object.keys(cssVars);
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.every((key) => key.startsWith('--md-color-'))).toBe(true);
    });
  });

  describe('getVuetifyColors', () => {
    it('应该生成 Vuetify 兼容的颜色对象', () => {
      const { getThemeColorFromColor, getVuetifyColors } = useMdColor();

      const theme = getThemeColorFromColor('#20a6fc');
      const vuetifyColors = getVuetifyColors(theme);

      expect(vuetifyColors).toHaveProperty('light');
      expect(vuetifyColors).toHaveProperty('dark');
      expect(vuetifyColors.light).toHaveProperty('primary');
      expect(vuetifyColors.light).toHaveProperty('on-primary');
    });
  });
});
