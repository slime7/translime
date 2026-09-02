import * as m3utils from '@material/material-color-utilities';
import {
  DEFAULT_THEME_COLOR_VARIANT,
  M3_SPEC_VERSION,
  normalizeThemeColorVariant,
} from './themeColorConfig';

/**
 * M3 2025 规范下宿主对外提供的颜色 token。
 * @type {ReadonlyArray<string>}
 */
const tokens = [
  'primary', 'primaryDim', 'onPrimary', 'primaryContainer', 'onPrimaryContainer', 'inversePrimary',
  'primaryFixed', 'primaryFixedDim', 'onPrimaryFixed', 'onPrimaryFixedVariant',
  'secondary', 'secondaryDim', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'secondaryFixed', 'secondaryFixedDim', 'onSecondaryFixed', 'onSecondaryFixedVariant',
  'tertiary', 'tertiaryDim', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'tertiaryFixed', 'tertiaryFixedDim', 'onTertiaryFixed', 'onTertiaryFixedVariant',
  'error', 'errorDim', 'onError', 'errorContainer', 'onErrorContainer',
  'surfaceDim', 'surface', 'surfaceBright',
  'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest',
  'onSurface', 'onSurfaceVariant', 'outline', 'outlineVariant',
  'inverseSurface', 'inverseOnSurface',
  'surfaceVariant', 'surfaceTint',
  'background', 'onBackground',
  'shadow', 'scrim',
];

/**
 * 使用 2025 Material 3 颜色规范创建动态配色方案。
 * @param {object} hct - HCT 源颜色
 * @param {boolean} isDark - 是否创建深色方案
 * @param {string} variant - 请求的方案变体
 * @param {number} contrastLevel - 对比度级别
 * @returns {object} 动态配色方案
 */
const createScheme = (hct, isDark, variant, contrastLevel) => {
  const normalizedVariant = normalizeThemeColorVariant(variant);
  const Scheme = m3utils[normalizedVariant];

  return new Scheme(hct, isDark, contrastLevel, M3_SPEC_VERSION);
};

/**
 * 直接从生成的动态方案中读取颜色角色。
 * @param {string} token - camelCase 格式的颜色角色名
 * @param {object} scheme - 动态配色方案
 * @returns {number} ARGB 颜色值
 */
const getDynamicColor = (token, scheme) => scheme[token];

/**
 * 根据源颜色和目标颜色生成自定义颜色组。
 *
 * @param {number} source - 源颜色
 * @param {{value: number, blend?: boolean}} color - 自定义颜色
 * @param {string} variant - 2025 规范支持的方案变体
 * @param {number} contrastLevel - -1.0 到 1.0 的对比度级别
 * @returns {object} 自定义颜色组
 *
 * @link https://m3.material.io/styles/color/the-color-system/color-roles
 */
export function customColor(source, color, variant = DEFAULT_THEME_COLOR_VARIANT, contrastLevel = 0.0) {
  let { value } = color;
  const from = value;
  if (color.blend) {
    value = m3utils.Blend.harmonize(from, source);
  }
  const hct = m3utils.Hct.fromInt(value);
  const scheme = createScheme(hct, false, variant, contrastLevel);
  const darkScheme = createScheme(hct, true, variant, contrastLevel);
  return {
    color,
    value,
    light: {
      color: getDynamicColor('primary', scheme),
      onColor: getDynamicColor('onPrimary', scheme),
      colorContainer: getDynamicColor('primaryContainer', scheme),
      onColorContainer: getDynamicColor('onPrimaryContainer', scheme),
    },
    dark: {
      color: getDynamicColor('primary', darkScheme),
      onColor: getDynamicColor('onPrimary', darkScheme),
      colorContainer: getDynamicColor('primaryContainer', darkScheme),
      onColorContainer: getDynamicColor('onPrimaryContainer', darkScheme),
    },
  };
}
/**
 * 根据源颜色生成主题。
 *
 * @param {number} source - 源颜色
 * @param {string} variant - 2025 规范支持的方案变体
 * @param {number} contrastLevel - -1.0 到 1.0 的对比度级别
 * @param {Array<object>} customColors - 自定义颜色数组
 * @returns {object} 主题对象
 */
export function themeFromSourceColor(source, variant = DEFAULT_THEME_COLOR_VARIANT, contrastLevel = 0.0, customColors = []) {
  const hct = m3utils.Hct.fromInt(source);
  const normalizedVariant = normalizeThemeColorVariant(variant);
  const scheme = createScheme(hct, false, normalizedVariant, contrastLevel);
  const darkScheme = createScheme(hct, true, normalizedVariant, contrastLevel);
  const getDynamicColors = (s) => Object.fromEntries(tokens.map((token) => [token, getDynamicColor(token, s)]));
  return {
    source,
    schemes: {
      light: getDynamicColors(scheme),
      dark: getDynamicColors(darkScheme),
    },
    palettes: {
      primary: scheme.primaryPalette,
      secondary: scheme.secondaryPalette,
      tertiary: scheme.tertiaryPalette,
      neutral: scheme.neutralPalette,
      neutralVariant: scheme.neutralVariantPalette,
      error: scheme.errorPalette,
    },
    customColors: customColors.map((c) => customColor(source, c, normalizedVariant, contrastLevel)),
  };
}
/**
 * 根据图片源颜色生成主题。
 *
 * @param {HTMLImageElement} image - 图片元素
 * @param {string} variant - 2025 规范支持的方案变体
 * @param {number} contrastLevel - -1.0 到 1.0 的对比度级别
 * @param {Array<object>} customColors - 自定义颜色数组
 * @returns {Promise<object>} 主题对象
 */
export async function themeFromImage(image, variant = DEFAULT_THEME_COLOR_VARIANT, contrastLevel = 0.0, customColors = []) {
  const source = await m3utils.sourceColorFromImage(image);
  return themeFromSourceColor(source, variant, contrastLevel, customColors);
}

/**
 * 将主题配色转换为 CSS 变量样式对象
 *
 * @param {object} theme - M3 主题对象
 * @param {object} options - 选项
 * @param {boolean} [options.dark=false] - 是否使用深色模式
 * @returns {object} CSS 变量样式对象
 */
export function getThemeStyles(theme, { dark = false }) {
  const styles = {};
  const schemes = dark ? theme.schemes.dark : theme.schemes.light;
  // eslint-disable-next-line no-restricted-syntax
  for (const [key, value] of Object.entries(schemes)) {
    const token = key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    styles[`--md-color-${token}`] = typeof value === 'number' ? m3utils.hexFromArgb(value) : value;
  }
  return styles;
}

/**
 * 将 M3 主题中的 ARGB 颜色值转换为十六进制字符串格式
 *
 * @param {object} themeData - M3 主题数据对象 (由 themeFromSourceColor 或 themeFromImage 返回)
 * @returns {object} 包含十六进制颜色字符串的主题数据对象
 */
export function getReadableColors(themeData) {
  const result = { ...themeData };

  // 辅助函数：转换配色方案中的所有颜色
  const convertScheme = (scheme) => Object.fromEntries(
    Object.entries(scheme).map(([key, value]) => [
      key,
      typeof value === 'number' ? m3utils.hexFromArgb(value) : value,
    ]),
  );

  // 转换源颜色
  if (typeof themeData.source === 'number') {
    result.source = m3utils.hexFromArgb(themeData.source);
  }

  // 转换核心配色方案
  if (themeData.schemes) {
    result.schemes = {
      light: convertScheme(themeData.schemes.light),
      dark: convertScheme(themeData.schemes.dark),
    };
  }

  // 转换自定义颜色
  if (themeData.customColors && Array.isArray(themeData.customColors)) {
    result.customColors = themeData.customColors.map((c) => ({
      ...c,
      value: typeof c.value === 'number' ? m3utils.hexFromArgb(c.value) : c.value,
      light: convertScheme(c.light),
      dark: convertScheme(c.dark),
    }));
  }

  return result;
}

/**
 * 将 camelCase 键名转换为 kebab-case
 *
 * @param {string} str - camelCase 字符串
 * @returns {string} kebab-case 字符串
 */
const toKebabCase = (str) => str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

/**
 * 将 M3 主题配色转换为 Vuetify 兼容的格式 (kebab-case 键名)
 *
 * @param {object} themeData - M3 主题数据对象 (由 getReadableColors 返回的十六进制格式)
 * @returns {object} Vuetify 兼容的主题配色对象，包含 light 和 dark 两个配色方案
 *
 * @example
 * const theme = getReadableColors(themeFromSourceColor(...));
 * const vuetifyColors = getVuetifyColors(theme);
 * // vuetifyColors.light = { 'primary': '#xxx', 'on-primary': '#xxx', ... }
 */
export function getVuetifyColors(themeData) {
  const convertScheme = (scheme) => Object.fromEntries(
    Object.entries(scheme).map(([key, value]) => [toKebabCase(key), value]),
  );

  return {
    light: convertScheme(themeData.schemes.light),
    dark: convertScheme(themeData.schemes.dark),
  };
}
