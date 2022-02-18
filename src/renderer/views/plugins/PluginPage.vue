<template>
  <div class="plugin-container">
    <component v-if="ui" :is="ui" />
  </div>
</template>

<script>
import Vue from 'vue';
import mixins from '@/mixins';

export default {
  name: 'PluginPage',

  mixins: [mixins],

  props: {
    packageName: {
      default: '',
      type: String,
    },
  },

  data: () => ({
    ui: null,
  }),

  computed: {
    plugin() {
      return this.packageName ? this.$store.state.plugins[this.$store.state.plugins.findIndex((p) => p.packageName === this.packageName)] : null;
    },
    containerId() {
      return `plugin-container-${this.plugin.packageName}`;
    },
  },

  watch: {
    'plugin.enabled': function (v, prevV) {
      if (!prevV && v) {
        this.loadUi();
      }
    },
  },

  methods: {
    init() {
      this.loadUi();
    },
    async loadUi() {
      if (this.plugin && this.plugin.ui) {
        const uiBlob = window.loadPluginUi(this.plugin.ui);
        const uiUrl = URL.createObjectURL(uiBlob);
        try {
          await this.loadScript(uiUrl);
          this.ui = Vue.extend(window[this.packageName]);
        } catch (err) {
          this.alert('加载插件页面失败', 'error');
        }
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

  mounted() {
    this.init();
  },
};
</script>

<style scoped lang="scss">
.plugin-container {
  width: 100%;
  height: 100%;

  .webview {
    width: 100%;
    min-height: 100%;
  }

  .dev-fab {
    position: fixed;
    bottom: 16px;
    right: 16px;
  }
}
</style>
