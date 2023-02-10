<template>
  <router-view />
</template>

<script>
import { onMounted } from 'vue';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import useTheme from '@/hooks/useTheme';
import { useIpc } from '@/hooks/electron';
import useAlert from '@/hooks/useAlert';
import globalStore from '@/store/globalStore';
import { appConfigStore } from '@/utils';

export default {
  name: 'App',

  setup() {
    const ipc = useIpc();
    const ipcRaw = useIpc(false);
    const store = globalStore();
    const theme = useTheme();
    const alert = useAlert();

    const initAppConfig = () => {
      store.initAppConfig();
    };
    const remoteConsoleListener = () => {
      ipc.on('console', ({ type, args }) => {
        // eslint-disable-next-line no-console
        console[type](...args);
      });
    };
    const getPlugins = async () => {
      try {
        const plugins = await ipc.invoke(ipcType.GET_PLUGINS);
        store.setPlugins(plugins);
      } catch (err) {
        alert.show(err.message, 'error');
      }
    };
    const getTheme = async () => {
      theme.setTheme(await appConfigStore.get('setting.theme', 'system'));
      const { shouldUseDarkColors: dark } = await theme.getNativeTheme();
      theme.setDark(dark);
    };
    const themeUpdated = () => {
      ipc.on(ipcType.THEME_UPDATED, ({ dark }) => {
        theme.setDark(dark);
      });
    };
    const handleKeyEvent = () => {
      window.addEventListener('keyup', (ev) => {
        if (ev.key === 'F12') {
          ipc.send(ipcType.DEVTOOLS);
        }
      });
    };

    // created
    remoteConsoleListener();
    initAppConfig();
    themeUpdated();
    getTheme();
    handleKeyEvent();

    onMounted(() => {
      ipcRaw.send('main-renderer-ready');
      getPlugins();
    });
  },
};
</script>

<style lang="scss" src="./assets/styles/app.scss"></style>
