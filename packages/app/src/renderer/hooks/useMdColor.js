import { argbFromHex, hexFromArgb } from '@material/material-color-utilities';
import {
  getReadableColors,
  getThemeStyles,
  getVuetifyColors,
  themeFromImage,
  themeFromSourceColor,
} from '@/utils/mdColorHelper';
import { DEFAULT_THEME_COLOR_VARIANT } from '@/utils/themeColorConfig';

/**
 * Material Design 3 配色方案变体
 * @typedef {'SchemeExpressive' | 'SchemeTonalSpot' | 'SchemeVibrant' | 'SchemeNeutral'} SchemeVariant
 */

/**
 * M3 主题对象 (十六进制格式)
 * @typedef {object} M3Theme
 * @property {string} source - 源颜色 (十六进制格式，如 '#6750A4')
 * @property {object} schemes - 包含 light 和 dark 配色方案 (十六进制格式)
 * @property {object} schemes.light - 浅色方案下的所有颜色 token (十六进制格式)
 * @property {object} schemes.dark - 深色方案下的所有颜色 token (十六进制格式)
 * @property {object} palettes - 主要调色板 (ARGB 数字格式)
 * @property {Array<object>} [customColors] - 自定义颜色数组 (十六进制格式)
 */

/**
 * 从十六进制颜色生成 Material Design 3 主题配色
 *
 * @param {string} color - 源颜色，十六进制格式 (如 '#6750A4')
 * @param {SchemeVariant} [variant='SchemeExpressive'] - 配色方案变体，使用 M3 2025 规范
 *   可选值:
 *   - `SchemeExpressive`: 鲜艳表达配色
 *   - `SchemeTonalSpot`: 平衡和谐配色
 *   - `SchemeVibrant`: 高饱和度配色
 *   - `SchemeNeutral`: 中性配色
 * @param {number} [contrastLevel=0.0] - 对比度级别，范围 -1.0 到 1.0
 * @param {Array<object>} [customColors=[]] - 自定义颜色数组
 * @returns {M3Theme} M3 主题对象，包含 schemes, palettes 等
 *
 * @example
 * const theme = getThemeColorFromColor('#6750A4');
 * console.log(theme.schemes.light.primary); // 浅色主题的主色
 */
const getThemeColorFromColor = (
  color,
  variant = DEFAULT_THEME_COLOR_VARIANT,
  contrastLevel = 0.0,
  customColors = [],
) => {
  const sourceArgb = argbFromHex(color);
  const theme = themeFromSourceColor(sourceArgb, variant, contrastLevel, customColors);
  return getReadableColors(theme);
};

/**
 * 从图片异步提取主色并生成 Material Design 3 主题配色
 *
 * @param {HTMLImageElement} image - 图片元素
 * @param {SchemeVariant} [variant='SchemeExpressive'] - 配色方案变体，使用 M3 2025 规范
 *   可选值:
 *   - `SchemeExpressive`: 鲜艳表达配色
 *   - `SchemeTonalSpot`: 平衡和谐配色
 *   - `SchemeVibrant`: 高饱和度配色
 *   - `SchemeNeutral`: 中性配色
 * @param {number} [contrastLevel=0.0] - 对比度级别，范围 -1.0 到 1.0
 * @param {Array<object>} [customColors=[]] - 自定义颜色数组
 * @returns {Promise<M3Theme>} M3 主题对象
 *
 * @example
 * const imgEl = document.getElementById('myImage');
 * const theme = await getThemeColorFromImage(imgEl);
 * console.log(theme.schemes.dark.primary); // 深色主题的主色
 */
const getThemeColorFromImage = async (
  image,
  variant = DEFAULT_THEME_COLOR_VARIANT,
  contrastLevel = 0.0,
  customColors = [],
) => {
  const theme = await themeFromImage(image, variant, contrastLevel, customColors);
  return getReadableColors(theme);
};

/**
 * 将 M3 主题转换为 CSS 样式对象 (CSS 变量)
 *
 * @param {M3Theme} theme - M3 主题对象
 * @param {object} options - 选项
 * @param {boolean} [options.dark=false] - 是否使用深色方案
 * @returns {object} CSS 变量对象 (如 { '--md-color-primary': '#6750A4' })
 *
 * @example
 * const theme = getThemeColorFromColor('#6750A4');
 * const cssVars = getThemeCssVars(theme, { dark: true });
 * Object.assign(document.documentElement.style, cssVars);
 */
const getThemeCssVars = (theme, { dark = false } = {}) => getThemeStyles(theme, { dark });

/**
 * 将 ARGB 颜色值转换为十六进制字符串
 *
 * @param {number} argb - ARGB 颜色值
 * @returns {string} 十六进制颜色字符串 (如 '#6750A4')
 */
const argbToHex = (argb) => hexFromArgb(argb);

/**
 * 将十六进制颜色字符串转换为 ARGB 值
 *
 * @param {string} hex - 十六进制颜色字符串 (如 '#6750A4')
 * @returns {number} ARGB 颜色值
 */
const hexToArgb = (hex) => argbFromHex(hex);

/**
 * Material Design 颜色工具 Hook
 *
 * 提供从颜色或图片生成 M3 配色方案的能力。
 * 生成的主题可用于设置 Vuetify 主题或作为 CSS 变量应用。
 *
 * @returns {object} 颜色工具对象
 *
 * @example
 * const { getThemeColorFromColor, getThemeCssVars } = useMdColor();
 * const theme = getThemeColorFromColor('#6750A4', 'SchemeVibrant');
 * // 应用到 Vuetify 或 CSS 变量
 */
export default function useMdColor() {
  return {
    getThemeColorFromColor,
    getThemeColorFromImage,
    getThemeCssVars,
    getVuetifyColors,
    argbToHex,
    hexToArgb,
  };
}
