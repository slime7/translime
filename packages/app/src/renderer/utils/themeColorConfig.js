/**
 * 宿主主题生成器使用的 Material 3 规范版本。
 * @type {string}
 */
export const M3_SPEC_VERSION = '2025';

/**
 * 默认的 translime 主题源颜色。
 * @type {string}
 */
export const DEFAULT_THEME_COLOR_SOURCE = '#20a6fc';

/**
 * 默认的 Material 3 配色方案变体。
 * @type {string}
 */
export const DEFAULT_THEME_COLOR_VARIANT = 'SchemeExpressive';

/**
 * 2025 颜色规范支持的配色方案变体。
 * @type {ReadonlyArray<string>}
 */
export const SUPPORTED_THEME_COLOR_VARIANTS = Object.freeze([
  'SchemeExpressive',
  'SchemeTonalSpot',
  'SchemeVibrant',
  'SchemeNeutral',
]);

/**
 * 需要迁移为鲜艳表达方案的旧配色方案变体。
 * @type {ReadonlyArray<string>}
 */
export const LEGACY_THEME_COLOR_VARIANTS = Object.freeze([
  'SchemeContent',
  'SchemeFidelity',
  'SchemeFruitSalad',
  'SchemeMonochrome',
  'SchemeRainbow',
]);

/**
 * 创建默认的持久化主题配色配置。
 * @returns {{name: string, source: string, variant: string}} 默认主题配色配置
 */
export const getDefaultThemeColor = () => ({
  name: 'translime',
  source: DEFAULT_THEME_COLOR_SOURCE,
  variant: DEFAULT_THEME_COLOR_VARIANT,
});

/**
 * 将主题配色方案变体归一化为 2025 规范支持的值。
 * @param {unknown} variant - 持久化或调用方传入的方案变体
 * @returns {string} 支持的方案变体
 */
export const normalizeThemeColorVariant = (variant) => {
  if (SUPPORTED_THEME_COLOR_VARIANTS.includes(variant)) {
    return variant;
  }
  return DEFAULT_THEME_COLOR_VARIANT;
};

/**
 * 归一化持久化的主题配色配置。
 * @param {unknown} themeColor - 持久化的主题配色值
 * @returns {{name: string, source: string, variant: string}} 归一化后的主题配色配置
 */
export const normalizeThemeColor = (themeColor) => {
  const value = themeColor && typeof themeColor === 'object' ? themeColor : {};
  const defaultThemeColor = getDefaultThemeColor();

  return {
    ...defaultThemeColor,
    ...value,
    variant: normalizeThemeColorVariant(value.variant),
  };
};
