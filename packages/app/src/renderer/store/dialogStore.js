import { defineStore, acceptHMRUpdate } from 'pinia';

const useDialogStore = defineStore('dialogStore', {
  state: () => ({
    // { attr: object, title: string, content: string }
    dialogs: [],
    titleClass: 'headline',
    loader: false,
    confirm: {
      visible: false,
      title: '',
      content: '',
      resolve: () => {},
      reject: () => {},
    },
  }),
  actions: {
    append({
      title = '提示',
      content,
      attr = {},
    }) {
      const defaultAttr = {
        maxWidth: 360,
      };
      this.dialogs.push({
        title,
        content,
        attr: Object.assign(defaultAttr, attr, { value: true }),
      });
    },
    pop() {
      this.dialogs.pop();
    },
    showConfirm({
      title = '提示',
      content,
    }) {
      this.$patch((state) => {
        state.confirm.title = title;
        state.confirm.content = content;
        state.confirm.visible = true;
      });
      return new Promise((resolve, reject) => {
        this.$patch((state) => {
          state.confirm.resolve = resolve;
          state.confirm.reject = reject;
        });
      });
    },
    clearConfirm() {
      this.$patch((state) => {
        state.confirm.visible = false;
        state.confirm.title = '';
        state.confirm.content = '';
        state.confirm.resolve = () => {};
        state.confirm.reject = () => {};
      });
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useDialogStore, import.meta.hot));
}

export default useDialogStore;
