import { useTheme as useVTheme } from 'vuetify';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useGlobalStore from '@/store/globalStore';
import { appConfigStore } from '@/utils';

const useTheme = () => {
  const ipc = useIpc();
  const store = useGlobalStore();
  const vTheme = useVTheme();

  const getNativeTheme = () => ipc.invoke(ipcType.GET_NATIVE_THEME);

  const setDark = (dark) => {
    store.dark = dark;
    vTheme.change(dark ? 'dark' : 'light');
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
   * 设置自定义主题颜色 (合并模式，不会覆盖已有的其他颜色)
   *
   * @param {object} colors - Vuetify 兼容的配色对象，包含 light 和 dark 两个属性
   * @param {object} colors.light - 浅色模式下的颜色 (kebab-case 格式)
   * @param {object} colors.dark - 深色模式下的颜色 (kebab-case 格式)
   * @param {object} [themeColor] - 可选，主题配色元数据，传入时会保存到 store 和配置
   * @param {string} themeColor.name - 配色名称 ('translime' | 'custom')
   * @param {string} themeColor.source - 源颜色 (十六进制格式)
   * @param {string} themeColor.variant - 配色方案变体
   */
  const setCustomTheme = (colors, themeColor) => {
    if (colors.light) {
      Object.assign(vTheme.themes.value.light.colors, colors.light);
    }
    if (colors.dark) {
      Object.assign(vTheme.themes.value.dark.colors, colors.dark);
    }
    // 如果提供了 themeColor，则保存到 store 和配置
    if (themeColor) {
      store.setAppThemeColor(themeColor);
      appConfigStore.set('setting.themeColor', themeColor);
      ipc.send(ipcType.THEME_COLOR_UPDATED);
    }
  };

  return {
    getNativeTheme,
    setTheme,
    setDark,
    setCustomTheme,
  };
};

export default useTheme;
