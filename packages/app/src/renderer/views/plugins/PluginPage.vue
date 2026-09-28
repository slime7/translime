<template>
  <div class="plugin-container" :class="{ 'plugin-container--embedded': isEmbeddedRoute }">
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
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useGlobalStore from '@/store/globalStore';
import { openPluginWindow } from '@/utils';
import PluginTitleBar from '@/views/Layout/components/PluginTitleBar.vue';

const isDev = import.meta.env.DEV;

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

    // 兜底：路由过渡的 after-enter 偶发不触发会使 pageTransitionActive 停留在 true，标题栏一直隐藏
    const ensureTitleBarVisible = () => {
      nextTick(() => {
        store.pageTransitionActive = false;
      });
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
            openPluginWindow(plugin.value);
            router.push({
              name: 'PluginCenter',
            });
          }
        }
        if (prevV && !v && !prevV.windowMode) {
          // 插件被卸载，且当前页面处于打开状态（非单独窗口模式）
          router.push({
            name: 'PluginCenter',
          });
        } else if (prevV?.enabled && !v?.enabled && !v?.windowMode) {
          // 插件被禁用，且当前处于嵌入模式
          if (route.name === 'PluginPage' && route.params.packageName === pluginId.value) {
            router.push({
              name: 'PluginCenter',
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
      ensureTitleBarVisible();
    });

    onActivated(() => {
      ensurePluginActivated();
      syncEmbeddedWebview();
      ensureTitleBarVisible();
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
      isEmbeddedRoute,
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

<style scoped>
.plugin-container {
  width: 100%;
  height: 100%;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 嵌入模式只占标题栏高度，webview 由 EmbeddedPluginWebviews 撑满剩余空间。
   与 .plugin-container 同级书写：嵌套会产生隐式后代选择器，无法匹配同一元素 */
.plugin-container--embedded {
  flex: 0 0 auto;
  height: auto;
}

.plugin-container .plugin-title-btn {
  user-select: none;
  cursor: default;
}

.plugin-container .webview {
  display: flex;
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
}

.plugin-container .dev-fab {
  position: fixed;
  bottom: 16px;
  right: 16px;
}
</style>
