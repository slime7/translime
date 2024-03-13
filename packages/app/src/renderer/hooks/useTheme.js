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
    vTheme.global.name.value = dark ? 'dark' : 'light';
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

  return {
    getNativeTheme,
    setTheme,
    setDark,
  };
};

export default useTheme;
