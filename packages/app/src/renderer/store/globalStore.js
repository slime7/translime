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
      pinnedPlugins: [],
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
    embeddedPluginWebviews: {},
    embeddedPluginInspectRequest: null,
  }),
  getters: {
    plugin: (state) => (pluginId) => state.plugins.find((plugin) => plugin.packageName === pluginId),
  },
  actions: {
    setPlugins(plugins) {
      this.plugins = plugins;
      const availablePluginIds = new Set(
        plugins
          .filter((plugin) => plugin.enabled && plugin.ui && !plugin.windowMode)
          .map((plugin) => plugin.packageName),
      );
      this.embeddedPluginWebviews = Object.fromEntries(
        Object.entries(this.embeddedPluginWebviews)
          .filter(([packageName]) => availablePluginIds.has(packageName)),
      );
    },
    updatePlugin(packageName, data) {
      const index = this.plugins.findIndex((p) => p.packageName === packageName);
      if (index !== -1) {
        this.plugins[index] = { ...this.plugins[index], ...data };
      }
    },
    setEmbeddedPluginWebview(packageName, webviewInfo) {
      if (!packageName) {
        return;
      }
      this.embeddedPluginWebviews = {
        ...this.embeddedPluginWebviews,
        [packageName]: {
          packageName,
          ...this.embeddedPluginWebviews[packageName],
          ...webviewInfo,
        },
      };
    },
    removeEmbeddedPluginWebview(packageName) {
      if (!packageName || !this.embeddedPluginWebviews[packageName]) {
        return;
      }
      const nextWebviews = { ...this.embeddedPluginWebviews };
      delete nextWebviews[packageName];
      this.embeddedPluginWebviews = nextWebviews;
    },
    requestEmbeddedPluginInspect(packageName) {
      if (!packageName) {
        return;
      }
      this.embeddedPluginInspectRequest = {
        packageName,
        time: Date.now(),
      };
    },
    clearEmbeddedPluginInspectRequest() {
      this.embeddedPluginInspectRequest = null;
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
        state.appSetting.pinnedPlugins = await appConfigStore.get('setting.pinnedPlugins', []);
      });
    },
    async togglePinPlugin(packageName) {
      if (!this.appSetting.pinnedPlugins) {
        this.appSetting.pinnedPlugins = [];
      }
      const index = this.appSetting.pinnedPlugins.indexOf(packageName);
      if (index > -1) {
        this.appSetting.pinnedPlugins.splice(index, 1);
      } else {
        this.appSetting.pinnedPlugins.push(packageName);
      }
      await appConfigStore.set('setting.pinnedPlugins', JSON.parse(JSON.stringify(this.appSetting.pinnedPlugins)));
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
