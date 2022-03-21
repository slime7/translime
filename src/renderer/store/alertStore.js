import { defineStore, acceptHMRUpdate } from 'pinia';
import { getUuiD } from '@pkg/share/utils';
import { useNotify } from '@/hooks/electron';

const useAlertStore = defineStore('alertStore', {
  state: () => ({
    contents: [],
    drawerVisible: false,
  }),
  getters: {
    getAlertById: (state) => (id) => state.contents.find((a) => a.uuid === id),
    activeAlerts: (state) => state.contents.filter((a) => a.visible),
  },
  actions: {
    pushContent({
      uuid,
      msg,
      type = 'info',
      timer = null,
      visible = true,
    }) {
      this.contents.push({
        uuid,
        msg,
        type,
        visible,
        time: +new Date(),
        timer,
      });
      if (this.contents.length > 300) {
        this.contents.shift();
      }
    },
    async push({
      msg,
      type = 'info',
      timeout = 6000,
    }) {
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
            const alert = this.getAlertById(uuid);
            alert.visible = false;
          }, timeout);
          this.pushContent({
            msg,
            uuid,
            timer,
          });
        } else {
          this.pushContent({
            msg,
            type,
            uuid,
            visible: false,
          });
          await notify.show({
            title: notifyTypes[type],
            body: msg,
          }, timeout);
        }
      } else {
        this.pushContent({
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
    dismiss({ uuid }) {
      const alert = this.getAlertById(uuid);
      if (alert) {
        clearTimeout(alert.timer);
        alert.visible = false;
      }
    },
    setDrawerVisible(visible) {
      this.drawerVisible = visible;
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAlertStore, import.meta.hot));
}

export default useAlertStore;
