<template>
  <div class="plugin-container">
    <plugin-title-bar :plugin="plugin" :visible="appBarVisible" v-if="plugin" @inspect="openWebviewDevTools" />

    <template v-if="showLocalWebview">
      <webview
        ref="webviewRef"
        class="webview grow border-none"
        :src="webviewSrc"
        nodeintegration="false"
        webpreferences="contextIsolation=yes, sandbox=false"
        :preload="preloadPath"
      />
    </template>
  </div>
</template>

<script>
import {
  computed,
  onActivated,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import * as components from 'vuetify/components';
import * as labsComponents from 'vuetify/labs/components';
import * as directives from 'vuetify/directives';
import { useIpc } from '@/hooks/electron';
import useGlobalStore from '@/store/globalStore';
import { openPluginWindow } from '@/utils';
import PluginTitleBar from '@/views/Layout/components/PluginTitleBar.vue';

const isDev = import.meta.env.DEV;

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
  },

  setup(props) {
    const store = useGlobalStore();
    const router = useRouter();
    const route = useRoute();
    const ipc = useIpc();
    const pluginActivated = ref(false);
    const preloadPath = ref('');
    const webviewRef = ref(null);
    const isEmbeddedRoute = computed(() => route.name === 'PluginPage');
    const isWindowRoute = computed(() => route.name === 'PluginWindow');

    const plugin = computed(() => (props.packageName ? store.plugin(props.packageName) : null));
    const pluginId = computed(() => (plugin.value ? plugin.value.packageName : undefined));
    const pluginLoadTime = computed(() => plugin.value?.loadTime || 0);
    const loaderVisible = computed(() => {
      if (!pluginActivated.value) {
        return false;
      }
      if (isWindowRoute.value) {
        return !!(plugin.value && plugin.value.ui);
      }
      return !!(plugin.value && plugin.value.ui && !plugin.value.windowMode);
    });
    const showLocalWebview = computed(() => loaderVisible.value && isWindowRoute.value);
    const webviewSrc = computed(() => {
      if (!plugin.value) {
        return '';
      }
      if (plugin.value.windowUrl) {
        return plugin.value.windowUrl;
      }
      const url = new URL(window.location.href);
      url.hash = `#/plugin-render/${pluginId.value}`;
      return url.href;
    });

    const ensurePluginActivated = async () => {
      if (!pluginId.value) {
        pluginActivated.value = false;
        return;
      }
      try {
        if (!preloadPath.value) {
          preloadPath.value = await ipc.invoke(ipcType.GET_PRELOAD_PATH);
        }
      } catch (err) {
        console.warn('GET_PRELOAD_PATH error:', err);
      }
      await ipc.invoke(ipcType.ACTIVATE_PLUGIN, pluginId.value, 'view');
      pluginActivated.value = true;
    };

    const syncEmbeddedWebview = () => {
      if (!isEmbeddedRoute.value || !pluginId.value || !loaderVisible.value || !preloadPath.value) {
        return;
      }
      store.setEmbeddedPluginWebview(pluginId.value, {
        src: webviewSrc.value,
        preloadPath: preloadPath.value,
        loadTime: pluginLoadTime.value,
        cacheKey: `${pluginId.value}:${pluginLoadTime.value || 0}`,
      });
    };

    watch(
      () => plugin.value,
      (v, prevV) => {
        if (v?.packageName && v.packageName !== prevV?.packageName) {
          pluginActivated.value = false;
          ensurePluginActivated();
        }
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

    watch(
      [pluginId, pluginLoadTime, preloadPath, loaderVisible, webviewSrc, isEmbeddedRoute],
      () => {
        syncEmbeddedWebview();
      },
      { immediate: true },
    );

    onMounted(() => {
      ensurePluginActivated();
    });

    onActivated(() => {
      ensurePluginActivated();
      syncEmbeddedWebview();
    });

    onDeactivated(() => {
      if (isEmbeddedRoute.value && pluginId.value) {
        syncEmbeddedWebview();
      }
    });

    const openWebviewDevTools = () => {
      if (showLocalWebview.value && webviewRef.value) {
        webviewRef.value.openDevTools();
        return;
      }
      if (isEmbeddedRoute.value && pluginId.value) {
        store.requestEmbeddedPluginInspect(pluginId.value);
      }
    };

    return {
      plugin,
      pluginId,
      pluginPath: computed(() => (plugin.value ? plugin.value.ui : undefined)),
      loaderVisible,
      showLocalWebview,
      appBarVisible: computed(() => !store.pageTransitionActive),
      pluginActivated,
      route,
      webviewSrc,
      preloadPath,
      webviewRef,
      openWebviewDevTools,
      isDev,
    };
  },
};
</script>

<style scoped lang="scss">
.plugin-container {
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;

  .plugin-title-btn {
    user-select: none;
    cursor: pointer;
  }

  .webview {
    display: flex;
    width: 100%;
    flex: 1 1 auto;
    min-height: 0;
  }

  .dev-fab {
    position: fixed;
    bottom: 16px;
    right: 16px;
  }
}
</style>
