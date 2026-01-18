import * as m3utils from '@material/material-color-utilities';

/**
 * All available color tokens
 */
const tokens = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer', 'inversePrimary',
  'primaryFixed', 'primaryFixedDim', 'onPrimaryFixed', 'onPrimaryFixedVariant',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'secondaryFixed', 'secondaryFixedDim', 'onSecondaryFixed', 'onSecondaryFixedVariant',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'tertiaryFixed', 'tertiaryFixedDim', 'onTertiaryFixed', 'onTertiaryFixedVariant',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'surfaceDim', 'surface', 'surfaceBright',
  'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest',
  'onSurface', 'onSurfaceVariant', 'outline', 'outlineVariant',
  'inverseSurface', 'inverseOnSurface',
  'surfaceVariant', 'surfaceTint',
  'background', 'onBackground',
  'shadow', 'scrim',
];
/**
 * Generate custom color group from source and target color
 *
 * @param source Source color
 * @param color Custom color
 * @param variant Scheme variant, equal to scheme class name (SchemeMonochrome, SchemeNeutral, SchemeTonalSpot,...)
 * @param contrastLevel Contrast level between -1.0 and 1.0
 * @return Custom color group
 *
 * @link https://m3.material.io/styles/color/the-color-system/color-roles
 */
export function customColor(source, color, variant = 'SchemeTonalSpot', contrastLevel = 0.0) {
  let { value } = color;
  const from = value;
  if (color.blend) {
    value = m3utils.Blend.harmonize(from, source);
  }
  const hct = m3utils.Hct.fromInt(value);
  const scheme = new m3utils[variant](hct, false, contrastLevel);
  const darkScheme = new m3utils[variant](hct, true, contrastLevel);
  const getDynamicColor = (token, s) => m3utils.MaterialDynamicColors[token].getArgb(s);
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
 * Generate a theme from a source color
 *
 * @param source Source color
 * @param customColors Array of custom colors
 * @param variant Scheme variant, equal to scheme class name (SchemeMonochrome, SchemeNeutral, SchemeTonalSpot,...)
 * @param contrastLevel Contrast level between -1.0 and 1.0
 * @return Theme object
 */
export function themeFromSourceColor(source, variant = 'SchemeTonalSpot', contrastLevel = 0.0, customColors = []) {
  const hct = m3utils.Hct.fromInt(source);
  const scheme = new m3utils[variant](hct, false, contrastLevel);
  const darkScheme = new m3utils[variant](hct, true, contrastLevel);
  const getDynamicColors = (s) => Object.fromEntries(tokens.map((token) => [token, m3utils.MaterialDynamicColors[token].getArgb(s)]));
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
    customColors: customColors.map((c) => customColor(source, c, variant, contrastLevel)),
  };
}
/**
 * Generate a theme from an image source
 *
 * @param image Image element
 * @param variant Scheme variant, equal to scheme class name (SchemeMonochrome, SchemeNeutral, SchemeTonalSpot,...)
 * @param contrastLevel Contrast level between -1.0 and 1.0
 * @param customColors Array of custom colors
 * @return Theme object
 */
export async function themeFromImage(image, variant = 'SchemeTonalSpot', contrastLevel = 0.0, customColors = []) {
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
