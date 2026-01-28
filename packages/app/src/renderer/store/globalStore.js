import { acceptHMRUpdate, defineStore } from 'pinia';
import { appConfigStore } from '@/utils';

const useGlobalStore = defineStore('globalStore', {
  state: () => ({
    versions: null,
    appSetting: {
      openAtLogin: false,
      minimizeToTrayOnClose: false,
      registry: '',
      theme: 'system',
      showDevPlugin: false,
      useNativeTitleBar: true,
      themeColor: {
        name: 'translime',
        source: '#20a6fc',
        variant: 'SchemeRainbow',
      },
    },
    plugins: [],
    dark: false,
    appArgv: [],
    pageTransitionActive: true,
  }),
  getters: {
    plugin: (state) => (pluginId) => state.plugins.find((plugin) => plugin.packageName === pluginId),
  },
  actions: {
    setPlugins(plugins) {
      this.plugins = plugins;
    },
    updatePlugin(packageName, data) {
      const index = this.plugins.findIndex((p) => p.packageName === packageName);
      if (index !== -1) {
        this.plugins[index] = { ...this.plugins[index], ...data };
      }
    },
    async initAppConfig() {
      this.$patch(async (state) => {
        const openAtLogin = await appConfigStore.get('setting.openAtLogin', false);
        const minimizeToTrayOnClose = await appConfigStore.get('setting.minimizeToTrayOnClose', false);
        const registry = await appConfigStore.get('setting.registry', 'https://registry.npmmirror.com/');
        state.appSetting.openAtLogin = openAtLogin;
        state.appSetting.minimizeToTrayOnClose = minimizeToTrayOnClose;
        state.appSetting.registry = registry;
        state.appSetting.theme = await appConfigStore.get('setting.theme', 'system');
        state.appSetting.showDevPlugin = await appConfigStore.get('setting.showDevPlugin', false);
        state.appSetting.useNativeTitleBar = await appConfigStore.get('setting.useNativeTitleBar', false);
        state.appSetting.themeColor = await appConfigStore.get('setting.themeColor', {
          name: 'translime',
          source: '#20a6fc',
          variant: 'SchemeRainbow',
        });
      });
    },
    setAppOpenAtLogin(open) {
      this.appSetting.openAtLogin = open;
    },
    setAppMinimizeToTrayOnClose(value) {
      this.appSetting.minimizeToTrayOnClose = value;
    },
    setAppRegistry(registry) {
      this.appSetting.registry = registry;
    },
    setAppTheme(theme) {
      this.appSetting.theme = theme;
    },
    setShowDevPlugin(isShow) {
      this.appSetting.showDevPlugin = isShow;
    },
    setAppArgv(argv) {
      this.appArgv = argv;
    },
    setUseNativeTitleBar(v) {
      this.appSetting.useNativeTitleBar = v;
    },
    setAppThemeColor(themeColor) {
      this.appSetting.themeColor = Object.assign(this.appSetting.themeColor, themeColor);
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useGlobalStore, import.meta.hot));
}

export default useGlobalStore;
