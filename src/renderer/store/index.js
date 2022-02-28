import Vue from 'vue';
import Vuex from 'vuex';
import toast from '@/store/moduleToast';
import dialog from '@/store/moduleDialog';
import alert from '@/store/moduleAlert';
import { useIpc } from '@/hooks/electron';

const ipcRaw = useIpc(false);

const appConfigStore = (method, ...args) => ipcRaw.invoke('appConfigStore', method, ...args);

Vue.use(Vuex);

export default new Vuex.Store({
  state: {
    versions: null,
    appSetting: {
      openAtLogin: false,
      registry: '',
    },
    plugins: [],
  },
  getters: {
    plugin: (state) => (packageName) => state.plugins.find((plugin) => plugin.packageName === packageName),
  },
  mutations: {
    setVersions(state, versions) {
      state.versions = versions;
    },
    setAppOpenAtLogin(state, open) {
      state.appSetting.openAtLogin = open;
    },
    setAppRegistry(state, registry) {
      state.appSetting.registry = registry;
    },
    setPlugins(state, plugins) {
      state.plugins = plugins;
    },
  },
  actions: {
    async initAppConfig({ commit }) {
      commit('setAppOpenAtLogin', await appConfigStore('get', 'setting.openAtLogin', false));
      commit('setAppRegistry', await appConfigStore('get', 'setting.registry', 'https://registry.npmmirror.com/'));
    },
  },
  modules: {
    toast,
    dialog,
    alert,
  },
});
