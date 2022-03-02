import { defineStore, acceptHMRUpdate } from 'pinia';

const useToastStore = defineStore('toastStore', {
  state: () => ({
    msg: '',
    visible: false,
    timeout: 6000,
    timer: null,
  }),
  actions: {
    show({ msg, timeout }) {
      if (this.visible) {
        clearTimeout(this.timer);
        this.visible = false;
      }
      const timer = setTimeout(() => {
        this.visible = false;
      }, this.timeout);
      this.$patch((state) => {
        state.msg = msg;
        state.timeout = timeout;
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
