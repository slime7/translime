<template>
  <v-app>
    <v-system-bar app class="system-bar pa-0">
      <div class="px-4">translime</div>

      <v-spacer />

      <window-controls
        :is-maximize="isMaximize"
        :win="`plugin-window-${pluginId}`"
        @windowMaximize="getIsMaximize"
        @windowUnmaximize="getIsMaximize"
      />
    </v-system-bar>

    <v-main class="fill-height">
      <div class="d-flex flex-column fill-height" id="app-main-container">
        <div class="scroll-content flex">
          <div class="plugin-container">
            <component v-if="ui" :is="ui" />
          </div>
        </div>
      </div>
    </v-main>
  </v-app>
</template>

<script>
import * as components from 'vuetify/lib/components';
import * as directives from 'vuetify/lib/directives';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import WindowControls from '@/components/WindowControls.vue';
import pluginUi from '@/mixins/pluginUi';

if (!window.vuetify$) {
  window.vuetify$ = {
    components,
    directives,
  };
}

export default {
  name: 'LayoutPluginWindow',

  components: {
    WindowControls,
  },

  mixins: [pluginUi],

  data: () => ({
    isMaximize: false,
    plugin: null,
    pluginId: 'translime-plugin-example',
  }),

  methods: {
    async getIsMaximize() {
      this.isMaximize = await this.$ipcRenderer.invoke(ipcType.APP_IS_MAXIMIZE, `plugin-window-${this.pluginId}`);
    },
    async onMounted() {
      await this.getIsMaximize();
      this.getPluginId();
      await this.getPlugin();
      if (this.plugin && this.plugin.ui) {
        await this.loadUi(this.plugin.ui, this.pluginId);
      }
    },
    onUnmounted() {
      this.$ipcRenderer.detach('set-maximize-status');
    },
    async getPlugin() {
      try {
        this.plugin = await this.$ipcRenderer.invoke(ipcType.GET_PLUGINS, this.pluginId);
      } catch (err) {
        //
      }
    },
    getPluginId() {
      const params = new URLSearchParams(window.location.search);
      this.pluginId = params.get('pluginId');
    },
  },

  mounted() {
    this.onMounted();
  },

  destroyed() {
    this.onUnmounted();
  },
};
</script>

<style scoped lang="scss">
.system-bar {
  -webkit-app-region: drag;
  z-index: 300;
}

#app-main-container > .scroll-content {
  min-height: 0;
  overflow-y: auto;

  &::-webkit-scrollbar {
    background-color: transparent;
  }
}
</style>
