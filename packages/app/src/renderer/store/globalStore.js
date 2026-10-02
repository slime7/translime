import { acceptHMRUpdate, defineStore } from 'pinia';
import { appConfigStore } from '@/utils';
import {
  getDefaultThemeColor,
  normalizeThemeColor,
} from '@/utils/themeColorConfig';

const useGlobalStore = defineStore('globalStore', {
  state: () => ({
    versions: null,
    appSetting: {
      openAtLogin: false,
      minimizeToTrayOnClose: false,
      registry: '',
      theme: 'system',
      showDevPlugin: false,
      pinnedPlugins: [],
      themeColor: getDefaultThemeColor(),
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
      const existing = this.embeddedPluginWebviews[packageName];
      // loadTime 从 0 变为具体值属于首次激活，插件 UI 产物并未变化；
      // 只有两个非零 loadTime 交替（插件重启）才更换 cacheKey 重建 webview，
      // 避免激活收尾的插件列表刷新把加载中的插件 UI 整个重载
      const prevLoadTime = existing?.loadTime || 0;
      const nextLoadTime = webviewInfo.loadTime || 0;
      const isRestart = prevLoadTime > 0 && nextLoadTime > 0 && prevLoadTime !== nextLoadTime;
      const cacheKey = isRestart
        ? `${packageName}:${nextLoadTime}`
        : existing?.cacheKey || `${packageName}:${nextLoadTime || prevLoadTime}`;
      this.embeddedPluginWebviews = {
        ...this.embeddedPluginWebviews,
        [packageName]: {
          packageName,
          ...existing,
          ...webviewInfo,
          cacheKey,
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
      const openAtLogin = await appConfigStore.get('setting.openAtLogin', false);
      const minimizeToTrayOnClose = await appConfigStore.get('setting.minimizeToTrayOnClose', false);
      const registry = await appConfigStore.get('setting.registry', 'https://registry.npmmirror.com/');
      const theme = await appConfigStore.get('setting.theme', 'system');
      const showDevPlugin = await appConfigStore.get('setting.showDevPlugin', false);
      const storedThemeColor = await appConfigStore.get('setting.themeColor', getDefaultThemeColor());
      const themeColor = normalizeThemeColor(storedThemeColor);
      const pinnedPlugins = await appConfigStore.get('setting.pinnedPlugins', []);

      if (storedThemeColor?.variant !== themeColor.variant) {
        await appConfigStore.set('setting.themeColor', themeColor);
      }

      this.$patch((state) => {
        state.appSetting.openAtLogin = openAtLogin;
        state.appSetting.minimizeToTrayOnClose = minimizeToTrayOnClose;
        state.appSetting.registry = registry;
        state.appSetting.theme = theme;
        state.appSetting.showDevPlugin = showDevPlugin;
        state.appSetting.themeColor = themeColor;
        state.appSetting.pinnedPlugins = pinnedPlugins;
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
    setAppThemeColor(themeColor) {
      this.appSetting.themeColor = normalizeThemeColor({
        ...this.appSetting.themeColor,
        ...themeColor,
      });
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useGlobalStore, import.meta.hot));
}

export default useGlobalStore;
