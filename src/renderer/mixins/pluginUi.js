import Vue from 'vue';

const mixins = {
  data: () => ({
    ui: null,
  }),

  methods: {
    async loadUi(ui, id) {
      const uiBlob = window.loadPluginUi(ui);
      const uiUrl = URL.createObjectURL(uiBlob);
      try {
        await this.loadScript(uiUrl);
        this.ui = Vue.extend(window[id]);
      } catch (err) {
        this.alert('加载插件页面失败', 'error');
      }
    },
    loadScript(url) {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const target = document.getElementsByTagName('script')[0] || document.head;
        script.type = 'text/javascript';
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        target.parentNode.insertBefore(script, target);
      });
    },
  },
};

export default mixins;
