import Vue from 'vue';
import Vuex from 'vuex';
import toast from '@/store/moduleToast';
import dialog from '@/store/moduleDialog';

const appConfigStore = (method, ...args) => window.electron.ipcRenderer.invoke('appConfigStore', method, ...args);

Vue.use(Vuex);

export default new Vuex.Store({
  state: {
    versions: null,
    appSetting: {
      openAtLogin: false,
    },
  },
  mutations: {
    setVersions(state, versions) {
      state.versions = versions;
    },
    setAppOpenAtLogin(state, open) {
      state.appSetting.openAtLogin = open;
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
  },
});
