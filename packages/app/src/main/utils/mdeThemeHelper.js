import * as m3utils from '@material/material-color-utilities';
import { nativeTheme } from 'electron';
import appConfigStore from './appConfigStore';

export const DEFAULT_THEME_COLOR_SOURCE = '#20a6fc';
export const DEFAULT_THEME_COLOR_VARIANT = 'SchemeExpressive';
export const M3_SPEC_VERSION = '2025';

const SUPPORTED_SCHEMES = {
  SchemeExpressive: m3utils.SchemeExpressive,
  SchemeTonalSpot: m3utils.SchemeTonalSpot,
  SchemeVibrant: m3utils.SchemeVibrant,
  SchemeNeutral: m3utils.SchemeNeutral,
};

const TOKENS = [
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

const toKebabCase = (str) => str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

/**
 * 判断当前是否应使用深色模式
 * @returns {boolean}
 */
export function isDarkMode() {
  const themeSetting = appConfigStore?.get('setting.theme', 'system');
  if (themeSetting === 'dark') return true;
  if (themeSetting === 'light') return false;
  return nativeTheme.shouldUseDarkColors;
}

/**
 * 获取当前配置的主题源颜色与变体
 * @returns {{ source: string, variant: string }}
 */
export function getThemeConfig() {
  const themeColor = appConfigStore?.get('setting.themeColor') || {};
  const source = themeColor.source || DEFAULT_THEME_COLOR_SOURCE;
  const variant = themeColor.variant || DEFAULT_THEME_COLOR_VARIANT;
  return { source, variant };
}

/**
 * 生成当前激活的 M3 主题令牌字典（53 个 --mat-sys-color-* 变量）
 * @param {object} [options]
 * @param {boolean} [options.dark] - 显式指定明暗模式，缺省自动读取
 * @param {string} [options.source] - 显式指定种子色十六进制，缺省自动读取
 * @param {string} [options.variant] - 显式指定方案变体，缺省自动读取
 * @returns {Record<string, string>}
 */
export function getMatThemeTokens(options = {}) {
  const dark = typeof options.dark === 'boolean' ? options.dark : isDarkMode();
  const cfg = getThemeConfig();
  const sourceHex = options.source || cfg.source;
  const variantName = options.variant || cfg.variant;

  let sourceInt;
  try {
    sourceInt = m3utils.argbFromHex(sourceHex);
  } catch {
    sourceInt = m3utils.argbFromHex(DEFAULT_THEME_COLOR_SOURCE);
  }

  const hct = m3utils.Hct.fromInt(sourceInt);
  const SchemeClass = SUPPORTED_SCHEMES[variantName] || m3utils.SchemeExpressive;
  const scheme = new SchemeClass(hct, dark, 0.0, M3_SPEC_VERSION);

  const tokens = {};
  TOKENS.forEach((token) => {
    const argb = scheme[token];
    if (typeof argb === 'number') {
      const kebab = toKebabCase(token);
      tokens[`--mat-sys-color-${kebab}`] = m3utils.hexFromArgb(argb);
    }
  });

  return tokens;
}

/**
 * 将当前激活的主题变量转化为 CSS 样式文本
 * @param {object} [options]
 * @param {string} [options.selector=':root'] - CSS 选择器
 * @returns {string}
 */
export function getMatThemeCss(options = {}) {
  const selector = options.selector || ':root';
  const tokens = getMatThemeTokens(options);
  const rules = Object.entries(tokens)
    .map(([prop, val]) => `  ${prop}: ${val};`)
    .join('\n');
  return `${selector} {\n${rules}\n}`;
}
