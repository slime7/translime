import { SUPPORTED_THEME_COLOR_VARIANTS } from '@/utils/themeColorConfig';

/**
 * 主题模式名称映射。
 * @type {{light: string, dark: string, system: string}}
 */
const THEME_MAP = {
  light: '明亮',
  dark: '暗黑',
  system: '系统',
};

/**
 * 2025 配色方案的显示名称。
 * @type {Readonly<Record<string, string>>}
 */
const THEME_COLOR_VARIANT_TITLES = {
  SchemeExpressive: '鲜艳',
  SchemeTonalSpot: '平衡和谐',
  SchemeVibrant: '高饱和度',
  SchemeNeutral: '中性',
};

/**
 * 主题颜色设置中展示的 2025 配色方案。
 * @type {Array<{title: string, value: string}>}
 */
const THEME_COLOR_VARIANTS = SUPPORTED_THEME_COLOR_VARIANTS.map((value) => ({
  title: THEME_COLOR_VARIANT_TITLES[value],
  value,
}));

export {
  THEME_COLOR_VARIANTS,
  THEME_MAP,
};
