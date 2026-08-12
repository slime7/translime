<template>
  <div
    v-show="isPluginPage"
    class="embedded-plugin-webviews"
  >
    <div
      v-for="entry in cachedEntries"
      :key="entry.cacheKey || entry.packageName"
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
