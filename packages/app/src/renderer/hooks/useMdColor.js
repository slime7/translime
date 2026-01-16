import { argbFromHex, hexFromArgb } from '@material/material-color-utilities';
import { getThemeStyles, themeFromImage, themeFromSourceColor } from '@/utils/mdColorHelper';

/**
 * Material Design 3 配色方案变体
 * @typedef {'SchemeContent' | 'SchemeExpressive' | 'SchemeFidelity' | 'SchemeFruitSalad' | 'SchemeMonochrome' | 'SchemeNeutral' | 'SchemeRainbow' | 'SchemeTonalSpot' | 'SchemeVibrant'} SchemeVariant
 */

/**
 * M3 主题对象
 * @typedef {object} M3Theme
 * @property {number} source - 源颜色 (ARGB)
 * @property {object} schemes - 包含 light 和 dark 配色方案
 * @property {object} schemes.light - 浅色方案下的所有颜色 token
 * @property {object} schemes.dark - 深色方案下的所有颜色 token
 * @property {object} palettes - 主要调色板
 */

/**
 * 从十六进制颜色生成 Material Design 3 主题配色
 *
 * @param {string} color - 源颜色，十六进制格式 (如 '#6750A4')
 * @param {SchemeVariant} [variant='SchemeTonalSpot'] - 配色方案变体
 *   可选值:
 *   - `SchemeContent`: 内容配色，强调主色
 *   - `SchemeExpressive`: 表达性配色，更鲜艳的色彩组合
 *   - `SchemeFidelity`: 忠实配色，严格遵循源颜色
 *   - `SchemeFruitSalad`: 水果沙拉配色，多彩活泼
 *   - `SchemeMonochrome`: 单色配色，灰度色彩
 *   - `SchemeNeutral`: 中性配色，低饱和度
 *   - `SchemeRainbow`: 彩虹配色，色相均匀分布
 *   - `SchemeTonalSpot`: (默认) 色调斑点配色，平衡且和谐
 *   - `SchemeVibrant`: 鲜艳配色，高饱和度
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
  variant = 'SchemeTonalSpot',
  contrastLevel = 0.0,
  customColors = [],
) => {
  const sourceArgb = argbFromHex(color);
  return themeFromSourceColor(sourceArgb, variant, contrastLevel, customColors);
};

/**
 * 从图片异步提取主色并生成 Material Design 3 主题配色
 *
 * @param {HTMLImageElement} image - 图片元素
 * @param {SchemeVariant} [variant='SchemeTonalSpot'] - 配色方案变体
 *   可选值:
 *   - `SchemeContent`: 内容配色，强调主色
 *   - `SchemeExpressive`: 表达性配色，更鲜艳的色彩组合
 *   - `SchemeFidelity`: 忠实配色，严格遵循源颜色
 *   - `SchemeFruitSalad`: 水果沙拉配色，多彩活泼
 *   - `SchemeMonochrome`: 单色配色，灰度色彩
 *   - `SchemeNeutral`: 中性配色，低饱和度
 *   - `SchemeRainbow`: 彩虹配色，色相均匀分布
 *   - `SchemeTonalSpot`: (默认) 色调斑点配色，平衡且和谐
 *   - `SchemeVibrant`: 鲜艳配色，高饱和度
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
  variant = 'SchemeTonalSpot',
  contrastLevel = 0.0,
  customColors = [],
) => themeFromImage(image, variant, contrastLevel, customColors);

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
    argbToHex,
    hexToArgb,
  };
}
