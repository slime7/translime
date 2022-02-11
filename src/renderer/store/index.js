import Vue from 'vue';
import Vuex from 'vuex';
import toast from '@/store/moduleToast';
import dialog from '@/store/moduleDialog';
import alert from '@/store/moduleAlert';

const appConfigStore = (method, ...args) => window.electron.ipcRenderer.invoke('appConfigStore', method, ...args);

Vue.use(Vuex);

export default new Vuex.Store({
  state: {
    versions: null,
    appSetting: {
      openAtLogin: false,
    },
    plugins: [],
  },
  mutations: {
    setVersions(state, versions) {
      state.versions = versions;
    },
    setAppOpenAtLogin(state, open) {
      state.appSetting.openAtLogin = open;
    },
    setPlugins(state, plugins) {
      state.plugins = plugins;
    },
  },
  actions: {
    async initAppConfig({ commit }) {
      if (await appConfigStore('has', 'setting.openAtLogin')) {
        commit('setAppOpenAtLogin', await appConfigStore('get', 'setting.openAtLogin'));
      }
    },
  },
  modules: {
    toast,
    dialog,
    alert,
  },
});
