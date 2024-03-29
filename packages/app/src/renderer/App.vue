<template>
  <router-view />
</template>

<script>
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import useTheme from '@/hooks/useTheme';
import { useIpc } from '@/hooks/electron';
import useAlert from '@/hooks/useAlert';
import useToast from '@/hooks/useToast';
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
    const toast = useToast();
    const router = useRouter();

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
        if (ev.key === 'F12' || (ev.key === 'I' && !ev.altKey && ev.ctrlKey && ev.shiftKey)) {
          ipc.send(ipcType.DEVTOOLS);
        }
      });
    };
    const handleAppArgv = () => {
      ipc.send(ipcType.GET_LAUNCH_ARGV);
      ipc.on(ipcType.GET_LAUNCH_ARGV, (argv) => {
        store.setAppArgv(argv);
      });
    };
    const onShowSettingPanel = () => {
      ipc.on(ipcType.OPEN_PLUGIN_SETTING_PANEL, ({ packageName }) => {
        router.replace({
          name: 'Plugins',
          query: { setting: packageName, t: +(new Date()) },
        });
      });
    };
    const offShowSettingPanel = () => {
      ipc.detach(ipcType.OPEN_PLUGIN_SETTING_PANEL);
    };
    const onUpdatePlugins = () => {
      ipc.on(ipcType.PLUGINS_CHANGED, () => {
        getPlugins();
      });
    };
    const offUpdatePlugins = () => {
      ipc.detach(ipcType.PLUGINS_CHANGED);
    };
    const onDeepLink = () => {
      ipc.on(ipcType.DEEP_LINK_OPEN, (params) => {
        if (params.install?.startsWith('translime-plugin-')) {
          // 安装插件
          router.replace({
            name: 'Plugins',
            query: { install: params.install, t: +(new Date()) },
          });
        }
      });
    };
    const offDeepLink = () => {
      ipc.detach(ipcType.DEEP_LINK_OPEN);
    };
    const onIpcToast = () => {
      ipc.on(ipcType.IPC_TOAST, (args) => {
        toast.show(...args);
      });
    };
    const offIpcToast = () => {
      ipc.detach(ipcType.IPC_TOAST);
    };

    // created
    remoteConsoleListener();
    initAppConfig();
    themeUpdated();
    getTheme();
    handleKeyEvent();
    handleAppArgv();

    onMounted(() => {
      ipcRaw.send('main-renderer-ready');
      getPlugins();
      onUpdatePlugins();
      onShowSettingPanel();
      onDeepLink();
      onIpcToast();
    });

    onUnmounted(() => {
      offUpdatePlugins();
      offShowSettingPanel();
      offDeepLink();
      offIpcToast();
    });
  },
};
</script>

<style lang="scss" src="./assets/styles/app.scss"></style>
