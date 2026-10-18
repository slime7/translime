import * as ipcType from '@pkg/share/utils/ipcConstant';
import matUi from '@/plugins/matUi';
import { useIpc } from '@/hooks/electron';
import useGlobalStore from '@/store/globalStore';
import { appConfigStore } from '@/utils';
import {
  DEFAULT_THEME_COLOR_SOURCE,
  DEFAULT_THEME_COLOR_VARIANT,
  normalizeThemeColor,
  toMatSchemeVariant,
} from '@/utils/themeColorConfig';

const DEFAULT_SYMBOL_COLORS = {
  dark: '#ffffff',
  light: '#1f1f1f',
};

/**
 * 将任意合法 CSS 颜色规范化为 #rrggbb；非法输入或环境无 canvas2D 时返回 null
 * @param {string} cssColor
 * @returns {string | null}
 */
const toRgbHex = (cssColor) => {
  if (!cssColor) return null;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#000000';
  ctx.fillStyle = cssColor.trim();
  return /^#[0-9a-f]{6}$/i.test(ctx.fillStyle)
    ? ctx.fillStyle
    : null;
};

/**
 * 读取 mde-vue 写入文档根节点的系统颜色令牌
 * @param {string} token - 不含前缀的颜色角色名，如 'on-surface'
 * @returns {string} 令牌值的原始文本，未定义时为空字符串
 */
const getMatColorToken = (token) => {
  if (typeof document === 'undefined') {
    return '';
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--mat-sys-color-${token}`);
  return value ? value.trim() : '';
};

const useTheme = () => {
  const ipc = useIpc();
  const store = useGlobalStore();
  const matTheme = matUi.theme;

  const getNativeTheme = () => ipc.invoke(ipcType.GET_NATIVE_THEME);

  /**
   * 把当前主题的系统栏前景色同步为原生 caption 按钮图标色，背景保持透明。
   * 标题栏高度由系统决定，渲染端通过 CSS env(titlebar-area-*) 自适应，不回写。
   * @param {string} [win] - 目标窗口名，默认主窗口 'app'
   */
  const syncOverlayColor = (win = 'app') => {
    const symbolHex = toRgbHex(getMatColorToken('on-surface'))
      || DEFAULT_SYMBOL_COLORS[store.dark ? 'dark' : 'light'];
    ipc.send(ipcType.SET_TITLE_BAR_OVERLAY, {
      win,
      symbolColor: symbolHex,
    });
  };

  const setDark = (dark) => {
    store.dark = dark;
    matTheme.setMode(dark ? 'dark' : 'light');
  };

  const setTheme = (theme) => {
    if (!['dark', 'light', 'system'].includes(theme)) {
      // eslint-disable-next-line no-param-reassign
      theme = 'system';
    }
    ipc.send(ipcType.SET_NATIVE_THEME, {
      theme,
    });
    appConfigStore.set('setting.theme', theme);
    store.setAppTheme(theme);
  };

  /**
   * 同步配色元数据到 mde-vue 主题控制器（宿主 UI 的 `--mat-sys-color-*` 令牌来源）。
   * @param {object} themeColor - 归一化前的配色元数据 { name, source, variant }
   */
  const syncMatTheme = (themeColor) => {
    const normalizedThemeColor = normalizeThemeColor(themeColor);
    if (normalizedThemeColor.name === 'translime') {
      matTheme.setSeedColor(DEFAULT_THEME_COLOR_SOURCE);
      matTheme.setSchemeVariant(toMatSchemeVariant(DEFAULT_THEME_COLOR_VARIANT));
      return;
    }
    matTheme.setSeedColor(normalizedThemeColor.source);
    matTheme.setSchemeVariant(toMatSchemeVariant(normalizedThemeColor.variant));
  };

  /**
   * 应用自定义主题配色：保存配色元数据并同步到 mde-vue 主题控制器
   *
   * @param {object} [themeColor] - 主题配色元数据，传入时会保存到 store 和配置
   * @param {string} themeColor.name - 配色名称 ('translime' | 'system' | 'custom')
   * @param {string} themeColor.source - 源颜色 (十六进制格式)
   * @param {string} themeColor.variant - 使用 M3 2025 规范的配色方案变体
   */
  const setCustomTheme = (themeColor) => {
    if (!themeColor) {
      return;
    }
    const normalizedThemeColor = normalizeThemeColor(themeColor);
    store.setAppThemeColor(normalizedThemeColor);
    appConfigStore.set('setting.themeColor', normalizedThemeColor);
    ipc.send(ipcType.THEME_COLOR_UPDATED);
    syncMatTheme(normalizedThemeColor);
  };

  return {
    getNativeTheme,
    setTheme,
    setDark,
    setCustomTheme,
    syncMatTheme,
    syncOverlayColor,
  };
};

export default useTheme;
