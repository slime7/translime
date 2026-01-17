<template>
  <router-view />
</template>

<script>
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import useTheme from '@/hooks/useTheme';
import useMdColor from '@/hooks/useMdColor';
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
    const mdColor = useMdColor();
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
    /**
     * 读取设置中的主题配色并应用
     * 如果配色名不是 'translime' (默认值)，则从 source 和 variant 生成 M3 配色并应用
     */
    const getThemeColors = async () => {
      const themeColor = await appConfigStore.get('setting.themeColor', {
        name: 'translime',
        source: '#20a6fc',
        variant: 'SchemeRainbow',
      });
      // 如果不是默认配色，则应用自定义配色
      if (themeColor.name !== 'translime') {
        const themeResult = mdColor.getThemeColorFromColor(themeColor.source, themeColor.variant);
        const vuetifyColors = mdColor.getVuetifyColors(themeResult);
        theme.setCustomTheme(vuetifyColors);
      }
    };
    const handleKeyEvent = () => {
      window.addEventListener('keyup', (ev) => {
        if (ev.key === 'F12' || (ev.key === 'I' && !ev.altKey && ev.ctrlKey && ev.shiftKey)) {
          ipc.send(ipcType.DEVTOOLS);
        }
      });
    };
    const handleAppArgv = async () => {
      const argv = await ipc.invoke(ipcType.GET_LAUNCH_ARGV);
      store.setAppArgv(argv);
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
      getThemeColors();
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
