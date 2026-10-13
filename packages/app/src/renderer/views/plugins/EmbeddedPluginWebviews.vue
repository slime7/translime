<template>
  <div
    v-show="isPluginPage"
    class="embedded-plugin-webviews"
  >
    <div
      v-for="entry in cachedEntries"
      :key="entry.packageName"
      v-show="entry.packageName === activePackageName"
      class="embedded-plugin-webview-item"
    >
      <webview
        :ref="(el) => setWebviewRef(entry.packageName, el)"
        class="embedded-plugin-webview border-none"
        :src="entry.src"
        nodeintegration="false"
        webpreferences="contextIsolation=yes, sandbox=false"
        :preload="entry.preloadPath"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import useGlobalStore from '@/store/globalStore';

const route = useRoute();
const store = useGlobalStore();
const webviewRefs = new Map();

const isPluginPage = computed(() => route.name === 'PluginPage');
const activePackageName = computed(() => (isPluginPage.value ? route.params.packageName : ''));
const cachedEntries = computed(() => Object.values(store.embeddedPluginWebviews)
  .filter((entry) => {
    const plugin = store.plugin(entry.packageName);
    return plugin && plugin.enabled && plugin.ui && !plugin.windowMode;
  }));

const setWebviewRef = (packageName, element) => {
  if (!packageName) {
    return;
  }
  if (element) {
    webviewRefs.set(packageName, element);
    return;
  }
  webviewRefs.delete(packageName);
};

// 插件重启（loadTime 变化）时原地 reload：同一 webview 元素重新加载宿主页面，
// 挂载时读取最新构建产物。销毁重建元素会触发 Electron webview 附加竞态，
// 使新 webview 长时间无响应
const reloadedLoadTimes = new Map();

watch(
  () => store.embeddedPluginWebviews,
  (webviews) => {
    Object.entries(webviews).forEach(([packageName, entry]) => {
      const loadTime = entry.loadTime || 0;
      const seenLoadTime = reloadedLoadTimes.get(packageName);
      if (seenLoadTime === undefined) {
        // 首次登记：webview 正以当前产物创建，无需重载
        reloadedLoadTimes.set(packageName, loadTime);
        return;
      }
      if (loadTime > seenLoadTime) {
        reloadedLoadTimes.set(packageName, loadTime);
        const webview = webviewRefs.get(packageName);
        // 页面仍在导航时不重复重载：本次挂载本就会读取最新构建产物
        if (webview && !webview.isLoading()) {
          webview.reload();
        }
      }
    });
    [...reloadedLoadTimes.keys()].forEach((packageName) => {
      if (!webviews[packageName]) {
        reloadedLoadTimes.delete(packageName);
      }
    });
  },
);

watch(
  () => store.embeddedPluginInspectRequest,
  (request) => {
    if (!request?.packageName) {
      return;
    }
    const webview = webviewRefs.get(request.packageName);
    if (webview) {
      webview.openDevTools();
    }
    store.clearEmbeddedPluginInspectRequest();
  },
);
</script>

<style scoped>
.embedded-plugin-webviews {
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.embedded-plugin-webview-item {
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
}

.embedded-plugin-webview {
  display: flex;
  width: 100%;
  height: 100%;
}
</style>
