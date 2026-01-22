<template>
  <div class="plugin-container">
    <plugin-title-bar :plugin="plugin" :visible="appBarVisible" v-if="plugin" />

    <plugin-ui-loader
      v-if="loaderVisible"
      :key="`${pluginId}-${plugin.loadTime}`"
      :plugin-path="pluginPath"
      :plugin-id="pluginId"
    />
  </div>
</template>

<script>
import {
  computed,
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

    const plugin = computed(() => (props.packageName ? store.plugin(props.packageName) : null));
    const pluginId = computed(() => (plugin.value ? plugin.value.packageName : undefined));
    const loaderVisible = computed(() => {
      if (route.name === 'PluginWindow') {
        return !!(plugin.value && plugin.value.ui);
      }
      return !!(plugin.value && plugin.value.ui && !plugin.value.windowMode);
    });

    watch(
      () => plugin.value,
      (v, prevV) => {
        if (!prevV?.windowMode && v?.windowMode) {
          // 从嵌入模式转为窗口模式
          if (route.name === 'PluginPage' && route.params.packageName === pluginId.value) {
            openPluginWindow(plugin.value, store.dark, store.appSetting);
            router.push({
              name: 'Home',
            });
          }
        }
        if (prevV && !v && !prevV.windowMode) {
          // 插件被卸载，且当前页面处于打开状态（非单独窗口模式）
          router.push({
            name: 'Home',
          });
        } else if (prevV?.enabled && !v?.enabled && !v?.windowMode) {
          // 插件被禁用，且当前处于嵌入模式
          if (route.name === 'PluginPage' && route.params.packageName === pluginId.value) {
            router.push({
              name: 'Home',
            });
          }
        }
      },
    );

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
