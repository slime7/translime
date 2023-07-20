<template>
  <div class="plugin-container">
    <plugin-title-bar :plugin="plugin" :visible="appBarVisible" v-if="plugin" />

    <plugin-ui-loader v-if="loaderVisible" :plugin-path="pluginPath" :plugin-id="pluginId" />
  </div>
</template>

<script>
import {
  computed,
  ref,
  onMounted,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as components from 'vuetify/components';
import * as labsComponents from 'vuetify/labs/components';
import * as directives from 'vuetify/directives';
import useGlobalStore from '@/store/globalStore';
import { openPluginWindow } from '@/utils';
import PluginTitleBar from '@/views/Layout/components/PluginTitleBar.vue';
import PluginUiLoader from './PluginUiLoader.vue';

if (!window.vuetify$) {
  window.vuetify$ = {
    components: {
      ...components,
      ...labsComponents,
    },
    directives,
  };
}

export default {
  name: 'PluginPage',

  props: {
    packageName: {
      default: '',
      type: String,
    },
  },

  components: {
    PluginTitleBar,
    PluginUiLoader,
  },

  setup(props) {
    const store = useGlobalStore();
    const router = useRouter();
    const route = useRoute();

    const plugin = computed(() => (props.packageName ? store.plugins[store.plugins.findIndex((p) => p.packageName === props.packageName)] : null));
    const pluginId = computed(() => (plugin.value ? plugin.value.packageName : undefined));
    const loaderVisible = ref(false);

    watch(
      () => plugin.value,
      (v, prevV) => {
        if (!prevV.windowMode && v.windowMode) {
          // 从嵌入模式转为窗口模式
          if (route.name === 'PluginPage' && route.params.packageName === pluginId.value) {
            openPluginWindow(plugin.value, store.dark, store.appSetting);
            router.push({
              name: 'Home',
            });
          }
          loaderVisible.value = false;
        }
        if (prevV.windowMode && !v.windowMode) {
          // 从窗口模式转为嵌入模式
          loaderVisible.value = !!(plugin.value && plugin.value.ui);
        }
      },
    );

    onMounted(() => {
      loaderVisible.value = !!(plugin.value && plugin.value.ui);
    });

    return {
      plugin,
      pluginId,
      pluginPath: computed(() => (plugin.value ? plugin.value.ui : undefined)),
      loaderVisible,
      appBarVisible: computed(() => !store.pageTransitionActive),
    };
  },
};
</script>

<style scoped lang="scss">
.plugin-container {
  width: 100%;
  height: 100%;

  .plugin-title-btn {
    user-select: none;
    cursor: pointer;
  }

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
