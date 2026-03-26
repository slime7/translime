import { acceptHMRUpdate, defineStore } from 'pinia';

const useToastStore = defineStore('toastStore', {
  state: () => ({
    msg: '',
    visible: false,
    timeout: 6000,
    timer: null,
  }),
  actions: {
    show({ msg, timeout }) {
      const nextTimeout = Number.isFinite(timeout) && timeout >= 0
        ? timeout
        : 6000;
      if (this.visible) {
        clearTimeout(this.timer);
        this.visible = false;
      }
      const timer = setTimeout(() => {
        this.visible = false;
      }, nextTimeout);
      this.$patch((state) => {
        state.msg = msg;
        state.timeout = nextTimeout;
        state.visible = true;
        state.timer = timer;
      });
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useToastStore, import.meta.hot));
}

export default useToastStore;
