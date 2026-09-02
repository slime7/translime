import {
  describe, expect, it,
} from 'vitest';
import {
  DEFAULT_THEME_COLOR_VARIANT,
  LEGACY_THEME_COLOR_VARIANTS,
  normalizeThemeColor,
  normalizeThemeColorVariant,
  SUPPORTED_THEME_COLOR_VARIANTS,
} from '@/utils/themeColorConfig';
import { THEME_COLOR_VARIANTS } from '@/components/settings/themeOptions';

describe('themeColorConfig', () => {
  it('应该只暴露支持 2025 规范的四种内置方案', () => {
    expect(SUPPORTED_THEME_COLOR_VARIANTS).toEqual([
      'SchemeExpressive',
      'SchemeTonalSpot',
      'SchemeVibrant',
      'SchemeNeutral',
    ]);
    expect(THEME_COLOR_VARIANTS.map((item) => item.value)).toEqual(SUPPORTED_THEME_COLOR_VARIANTS);
  });

  it('应该保留四种受支持的方案', () => {
    SUPPORTED_THEME_COLOR_VARIANTS.forEach((variant) => {
      expect(normalizeThemeColorVariant(variant)).toBe(variant);
    });
  });

  it('旧方案、未知方案和缺失方案应该迁移为 Expressive', () => {
    LEGACY_THEME_COLOR_VARIANTS.forEach((variant) => {
      expect(normalizeThemeColorVariant(variant)).toBe(DEFAULT_THEME_COLOR_VARIANT);
    });

    expect(normalizeThemeColorVariant('unknown')).toBe(DEFAULT_THEME_COLOR_VARIANT);
    expect(normalizeThemeColorVariant(undefined)).toBe(DEFAULT_THEME_COLOR_VARIANT);
  });

  it('应该保留主题配置并归一化方案值', () => {
    expect(normalizeThemeColor({
      name: 'custom',
      source: '#123456',
      variant: 'SchemeRainbow',
    })).toEqual({
      name: 'custom',
      source: '#123456',
      variant: DEFAULT_THEME_COLOR_VARIANT,
    });
  });
});
