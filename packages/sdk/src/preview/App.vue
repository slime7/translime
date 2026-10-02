<template>
  <v-app :theme="currentTheme">
    <v-main>
      <!-- 简洁的预览模式提示 -->
      <v-banner
        density="compact"
        color="info"
        lines="one"
      >
        <template #text>
          <span class="text-body-small">Preview 模式 - Electron API 已 mock</span>
        </template>
        <template #actions>
          <v-btn
            variant="text"
            :icon="currentTheme === 'light' ? 'dark_mode' : 'light_mode'"
            @click="toggleTheme"
          />
        </template>
      </v-banner>

      <!-- 插件组件 -->
      <component
        :is="pluginComponent"
        v-if="pluginComponent"
      />
      <div
        v-else
        class="d-flex align-center justify-center"
        style="height: 200px;"
      >
        <span class="text-medium-emphasis">加载中...</span>
      </div>
    </v-main>
  </v-app>
</template>

<script setup>
import { onMounted, ref, shallowRef } from 'vue';

defineOptions({
  name: 'PreviewApp',
});

// 初始主题跟随系统明暗偏好：preview 运行在浏览器中拿不到宿主 app 的主题配置，
// 跟随系统是能做到的最接近宿主表现的行为
const prefersDark = typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-color-scheme: dark)').matches;
const currentTheme = ref(prefersDark ? 'dark' : 'light');

// 插件组件
const pluginComponent = shallowRef(null);

const applyMdeMode = (mode) => {
  if (window.mde$?.theme?.setMode) {
    window.mde$.theme.setMode(mode);
  }
};

const toggleTheme = () => {
  const next = currentTheme.value === 'light' ? 'dark' : 'light';
  currentTheme.value = next;
  applyMdeMode(next);
};

onMounted(() => {
  applyMdeMode(currentTheme.value);
  if (window.__PREVIEW_PLUGIN_COMPONENT__) {
    pluginComponent.value = window.__PREVIEW_PLUGIN_COMPONENT__;
  }
});

defineExpose({
  setPluginComponent: (component) => {
    pluginComponent.value = component;
  },
});
</script>

<style scoped>
/* Preview 模式特定样式 */
</style>
