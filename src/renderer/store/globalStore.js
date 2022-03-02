import { defineStore, acceptHMRUpdate } from 'pinia';
import { useIpc } from '@/hooks/electron';

const ipcRaw = useIpc(false);
const appConfigStore = (method, ...args) => ipcRaw.invoke('appConfigStore', method, ...args);

const useGlobalStore = defineStore('globalStore', {
  state: () => ({
    versions: null,
    appSetting: {
      openAtLogin: false,
      registry: '',
    },
    plugins: [],
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
        const openAtLogin = await appConfigStore('get', 'setting.openAtLogin', false);
        const registry = await appConfigStore('get', 'setting.registry', 'https://registry.npmmirror.com/');
        state.appSetting.openAtLogin = openAtLogin;
        state.appSetting.registry = registry;
      });
    },
    setAppOpenAtLogin(open) {
      this.appSetting.openAtLogin = open;
    },
    setAppRegistry(registry) {
      this.appSetting.registry = registry;
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useGlobalStore, import.meta.hot));
}

export default useGlobalStore;
