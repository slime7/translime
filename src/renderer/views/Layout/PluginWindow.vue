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
            <plugin-ui-loader v-if="loaderVisible" :plugin-path="plugin.ui" :plugin-id="plugin.packageName" />
          </div>
        </div>
      </div>
    </v-main>
  </v-app>
</template>

<script>
import { onMounted, onUnmounted, ref } from 'vue';
import { useTheme as useVTheme } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import WindowControls from '@/components/WindowControls.vue';
import { useIpc } from '@/hooks/electron';
import PluginUiLoader from '@/views/plugins/PluginUiLoader.vue';

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
    PluginUiLoader,
  },

  setup() {
    const pluginId = ref('');
    const isMaximize = ref(false);
    const plugin = ref(null);
    const loaderVisible = ref(false);
    const ipc = useIpc();
    const vTheme = useVTheme();

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
      vTheme.global.name.value = !!darkParam && darkParam !== 'false' && darkParam !== '0' ? 'dark' : 'light';
    };
    const themeUpdated = () => {
      ipc.on(ipcType.THEME_UPDATED, ({ dark }) => {
        vTheme.global.name.value = dark ? 'dark' : 'light';
      });
    };

    onMounted(async () => {
      getPluginId();
      getDarkMode();
      onMaximizeStatusChange();
      themeUpdated();
      await getIsMaximize();
      await getPlugin();
      loaderVisible.value = plugin.value && plugin.value.ui;
    });

    onUnmounted(() => {
      ipc.detach(`set-maximize-status:plugin-window-${pluginId.value}`);
    });

    return {
      pluginId,
      isMaximize,
      plugin,
      getIsMaximize,
      loaderVisible,
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
