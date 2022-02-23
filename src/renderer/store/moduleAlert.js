import { getUuiD } from '@pkg/share/utils';

const moduleAlert = {
  namespaced: true,

  state: {
    contents: [],
    show: false,
    timeout: 6000,
    drawerVisible: false,
  },

  mutations: {
    push(state, {
      uuid,
      msg,
      type = 'info',
      timer = null,
    }) {
      state.contents.push({
        uuid,
        msg,
        type,
        visible: true,
        time: +new Date(),
        timer,
      });
    },
    setVisible(state, { uuid, visible }) {
      const alert = state.contents.find((a) => a.uuid === uuid);
      if (alert) {
        clearTimeout(alert.timer);
        alert.visible = visible;
      }
    },
    setDrawerVisible(state, visible) {
      state.drawerVisible = visible;
    },
  },

  actions: {
    push({ commit }, { msg, type, timeout = 6000 }) {
      const uuid = getUuiD();
      if (timeout > 0) {
        const timer = setTimeout(() => {
          commit('setVisible', { uuid, visible: false });
        }, timeout);
        commit('push', {
          msg,
          type,
          uuid,
          timer,
        });
      } else {
        commit('push', {
          msg,
          type,
          uuid,
        });
      }
    },
    dismiss({ commit }, { uuid }) {
      commit('setVisible', { uuid, visible: false });
    },
  },
};

export default moduleAlert;
