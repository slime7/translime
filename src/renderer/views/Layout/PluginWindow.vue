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
import { onMounted, onUnmounted, ref } from 'vue';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import WindowControls from '@/components/WindowControls.vue';
import { useIpc } from '@/hooks/electron';
import usePluginUi from '@/views/plugins/hooks/usePluginUi';

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

  setup(props, { root }) {
    const pluginId = ref('');
    const isMaximize = ref(false);
    const plugin = ref(null);
    const ipc = useIpc();
    const pluginUi = usePluginUi();

    const getPluginId = () => {
      const params = new URLSearchParams(window.location.search);
      pluginId.value = params.get('pluginId');
    };
    const onMaximizeStatusChange = () => {
      ipc.on(`set-maximize-status:plugin-window-${pluginId.value}`, (maximize) => {
        isMaximize.value = maximize;
      });
    };
    const getIsMaximize = async () => {
      isMaximize.value = await ipc.invoke(ipcType.APP_IS_MAXIMIZE, `plugin-window-${pluginId.value}`);
    };
    const getPlugin = async () => {
      try {
        plugin.value = await ipc.invoke(ipcType.GET_PLUGINS, pluginId.value);
      } catch (err) {
        //
      }
    };
    const getDarkMode = () => {
      const params = new URLSearchParams(window.location.search);
      const darkParam = params.get('dark');
      // eslint-disable-next-line no-param-reassign
      root.$vuetify.theme.dark = !!darkParam && darkParam !== 'false' && darkParam !== '0';
    };
    const themeUpdated = () => {
      ipc.on(ipcType.THEME_UPDATED, ({ dark }) => {
        // eslint-disable-next-line no-param-reassign
        root.$vuetify.theme.dark = dark;
      });
    };

    onMounted(async () => {
      getPluginId();
      getDarkMode();
      onMaximizeStatusChange();
      themeUpdated();
      await getIsMaximize();
      await getPlugin();
      if (plugin.value && plugin.value.ui) {
        await pluginUi.loadUi(plugin.value.ui, pluginId.value);
      }
    });

    onUnmounted(() => {
      ipc.detach(`set-maximize-status:plugin-window-${pluginId.value}`);
    });

    return {
      pluginId,
      isMaximize,
      plugin,
      ui: pluginUi.ui,
      getIsMaximize,
    };
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
