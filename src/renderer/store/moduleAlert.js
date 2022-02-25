import { getUuiD } from '@pkg/share/utils';
import { useNotify } from '@/hooks/electron';

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
      visible = true,
    }) {
      state.contents.push({
        uuid,
        msg,
        type,
        visible,
        time: +new Date(),
        timer,
      });
      if (state.contents.length > 300) {
        state.contents.shift();
      }
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
    async push({ commit }, { msg, type, timeout = 6000 }) {
      const notifyTypes = {
        info: '提示',
        error: '出错',
        success: '成功',
        warning: '警告',
      };
      const notify = useNotify();
      const uuid = getUuiD();
      const isSupportedSystemNotification = notify.isSupported();
      if (timeout > 0) {
        if (!isSupportedSystemNotification) {
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
            visible: false,
          });
          await notify.show({
            title: notifyTypes[type],
            body: msg,
            timeoutType: 'never',
          }, timeout);
        }
      } else {
        commit('push', {
          msg,
          type,
          uuid,
          visible: false,
        });
        await notify.show({
          title: notifyTypes[type],
          body: msg,
          timeoutType: 'never',
        });
      }
    },
    dismiss({ commit }, { uuid }) {
      commit('setVisible', { uuid, visible: false });
    },
  },
};

export default moduleAlert;
