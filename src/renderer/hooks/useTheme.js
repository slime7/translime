import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useGlobalStore from '@/store/globalStore';

const useTheme = (vm) => {
  const ipc = useIpc();
  const ipcRaw = useIpc(false);
  const appConfigStore = (method, ...args) => ipcRaw.invoke('appConfigStore', method, ...args);
  const store = useGlobalStore();

  const getNativeTheme = () => ipc.invoke(ipcType.GET_NATIVE_THEME);

  const setDark = (dark) => {
    store.dark = dark;
    // eslint-disable-next-line no-param-reassign
    vm.$vuetify.theme.dark = dark;
  };

  const setTheme = (theme) => {
    ipc.send(ipcType.SET_NATIVE_THEME, {
      theme,
    });
    if (theme === 'light') {
      // setDark(false);
    }
    if (theme === 'dark') {
      // setDark(true);
    }
    appConfigStore('set', 'setting.theme', theme);
    store.setAppTheme(theme);
  };

  return {
    getNativeTheme,
    setTheme,
    setDark,
  };
};

export default useTheme;
