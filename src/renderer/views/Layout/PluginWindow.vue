<template>
  <v-app>
    <v-system-bar app class="system-bar pa-0">
      <div v-if="!plugin" class="px-4">translime</div>
      <div v-else class="px-4">{{ plugin.title }} - translime</div>

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
import { useIpc } from '@/hooks/electron';

const ipc = useIpc();
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
    pluginId: '',
  }),

  methods: {
    async getIsMaximize() {
      this.isMaximize = await ipc.invoke(ipcType.APP_IS_MAXIMIZE, `plugin-window-${this.pluginId}`);
    },
    onMaximizeStatusChange() {
      ipc.on(`set-maximize-status:plugin-window-${this.pluginId}`, (maximize) => {
        this.isMaximize = maximize;
      });
    },
    async onMounted() {
      this.getPluginId();
      this.onMaximizeStatusChange();
      await this.getIsMaximize();
      await this.getPlugin();
      if (this.plugin && this.plugin.ui) {
        await this.loadUi(this.plugin.ui, this.pluginId);
      }
    },
    onUnmounted() {
      ipc.detach(`set-maximize-status:plugin-window-${this.pluginId}`);
    },
    async getPlugin() {
      try {
        this.plugin = await ipc.invoke(ipcType.GET_PLUGINS, this.pluginId);
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
