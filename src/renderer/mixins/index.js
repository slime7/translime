import store from '../store';

const mixins = {
  data: () => ({
    isDev: process.env.NODE_ENV === 'development',
  }),

  methods: {
    toast(msg, timeout = 6000) {
      store.dispatch('toast/show', { msg, timeout });
    },
    alert(msg, type = 'info') {
      store.dispatch('alert/push', { msg, type });
    },
    hideAlert(uuid) {
      store.dispatch('alert/dismiss', { uuid });
    },
    netFail(err = null) {
      console.log('请求错误: ', { error: err });
      if (err && err.response) {
        const { response } = err;
        const { data } = response.data;
        switch (response.status) {
          case 401:
          case 403:
            this.$router.replace({
              name: 'Login',
              query: { redirect: this.$router.currentRoute.fullPath },
            });
            break;

          default:
            break;
        }
        if (data && data.msg) {
          this.toast(data.msg);
        } else if (response.data.message) {
          this.toast(response.data.message);
        } else {
          this.toast('未知错误');
        }
      } else if (err && !err.response && err.message) {
        if (err.message !== 'Network Error') {
          this.toast(err.message);
        } else {
          this.toast('无法连接网络');
        }
      } else {
        this.toast('无法连接网络');
      }
    },
    dialog(content, title, attr = {}, hideClose = false) {
      store.dispatch('dialog/append', {
        content,
        title,
        hideClose,
        attr,
      });
    },
    showLoader() {
      store.dispatch('dialog/showLoader');
    },
    hideLoader() {
      store.dispatch('dialog/hideLoader');
    },
  },
};

export default mixins;
