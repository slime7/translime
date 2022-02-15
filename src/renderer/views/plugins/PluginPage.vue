<template>
  <div class="plugin-container">
    <webview
      v-if="plugin"
      class="webview"
      autosize="on"
      :src="`file://${plugin.main}`"
      :preload="preloadPath"
      ref="webview"
    />

    <div class="dev-fab" v-if="isDev">
      <v-btn fab @click="openDevtools">
        <v-icon>code</v-icon>
      </v-btn>
    </div>
  </div>
</template>

<script>
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

  computed: {
    plugin() {
      return this.packageName ? this.$store.state.plugins[this.$store.state.plugins.findIndex((p) => p.packageName === this.packageName)] : null;
    },
    containerId() {
      return `plugin-container-${this.plugin.packageName}`;
    },
    preloadPath() {
      return `file://${window.electron.APP_ROOT}\\preload\\index.js`;
    },
  },

  methods: {
    init() {},
    openDevtools() {
      const webviewRef = this.$refs.webview;
      if (webviewRef) {
        if (!webviewRef.isDevToolsOpened()) {
          webviewRef.openDevTools();
        } else {
          webviewRef.closeDevTools();
        }
      }
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
