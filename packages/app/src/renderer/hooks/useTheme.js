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

  const setCustomTheme = (theme, colors) => {
    console.log(vTheme.themes.value);
    vTheme.themes.value[theme].colors = colors;
  };

  return {
    getNativeTheme,
    setTheme,
    setDark,
    setCustomTheme,
  };
};

export default useTheme;
