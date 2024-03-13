import { defineStore, acceptHMRUpdate } from 'pinia';
import { appConfigStore } from '@/utils';

const useGlobalStore = defineStore('globalStore', {
  state: () => ({
    versions: null,
    appSetting: {
      openAtLogin: false,
      registry: '',
      theme: 'system',
      showDevPlugin: false,
      useNativeTitleBar: true,
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
    async initAppConfig() {
      this.$patch(async (state) => {
        const openAtLogin = await appConfigStore.get('setting.openAtLogin', false);
        const registry = await appConfigStore.get('setting.registry', 'https://registry.npmmirror.com/');
        state.appSetting.openAtLogin = openAtLogin;
        state.appSetting.registry = registry;
        state.appSetting.theme = await appConfigStore.get('setting.theme', 'system');
        state.appSetting.showDevPlugin = await appConfigStore.get('setting.showDevPlugin', false);
        state.appSetting.useNativeTitleBar = await appConfigStore.get('setting.useNativeTitleBar', false);
      });
    },
    setAppOpenAtLogin(open) {
      this.appSetting.openAtLogin = open;
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
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useGlobalStore, import.meta.hot));
}

export default useGlobalStore;
