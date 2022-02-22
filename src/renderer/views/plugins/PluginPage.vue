<template>
  <div class="plugin-container">
    <component v-if="ui" :is="ui" />
  </div>
</template>

<script>
import * as components from 'vuetify/lib/components';
import * as directives from 'vuetify/lib/directives';
import mixins from '@/mixins';
import pluginUi from '@/mixins/pluginUi';

if (!window.vuetify$) {
  window.vuetify$ = {
    components,
    directives,
  };
}

export default {
  name: 'PluginPage',

  mixins: [mixins, pluginUi],

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
  },

  watch: {
    'plugin.enabled': function (v, prevV) {
      if (!prevV && v) {
        this.loadUi(this.plugin.ui, this.packageName);
      }
    },
  },

  methods: {
    onMounted() {
      if (this.plugin && this.plugin.ui) {
        this.loadUi(this.plugin.ui, this.packageName);
      }
    },
  },

  mounted() {
    this.onMounted();
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
