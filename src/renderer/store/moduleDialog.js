const moduleDialog = {
  namespaced: true,

  state: {
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
  },

  mutations: {
    pushDialog(state, {
      title = '提示',
      content,
      attr = {},
    }) {
      const defaultAttr = {
        maxWidth: 360,
      };
      state.dialogs.push({
        title,
        content,
        attr: Object.assign(defaultAttr, attr, { value: true }),
      });
    },
    popDialog(state) {
      state.dialogs.pop();
    },
    setTitleClass(state, titleClass) {
      state.titleClass = titleClass;
    },
    setLoader(state, show) {
      state.loader = show;
    },
    setConfirm(state, {
      title,
      content,
    }) {
      state.confirm.title = title;
      state.confirm.content = content;
      state.confirm.visible = true;
    },
    clearConfirm(state) {
      state.confirm.visible = false;
      state.confirm.title = '';
      state.confirm.content = '';
      state.confirm.resolve = () => {};
      state.confirm.reject = () => {};
    },
    setConfirmPromise(state, { resolve = null, reject = null } = {}) {
      state.confirm.resolve = resolve;
      state.confirm.reject = reject;
    },
  },

  actions: {
    append({ commit }, dialog) {
      commit('pushDialog', dialog);
    },
    close({ commit }) {
      commit('popDialog');
    },
    showLoader({ commit }) {
      commit('setLoader', true);
    },
    hideLoader({ commit }) {
      commit('setLoader', false);
    },
    confirm({ commit }, { title = '提示', content }) {
      commit('setConfirm', { title, content });
      return new Promise((resolve, reject) => {
        commit('setConfirmPromise', { resolve, reject });
      });
    },
  },
};

export default moduleDialog;
