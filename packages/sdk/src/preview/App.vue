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
          <span style="font-size: 12px;">Preview 模式 - Electron API 已 mock</span>
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
        style="display: flex; align-items: center; justify-content: center; height: 200px;"
      >
        <span style="opacity: .6;">加载中...</span>
      </div>
    </v-main>
  </v-app>
</template>

<script setup>
import { onMounted, ref, shallowRef } from 'vue';

defineOptions({
  name: 'PreviewApp',
});

// 主题切换
const currentTheme = ref('light');

// 插件组件
const pluginComponent = shallowRef(null);

const toggleTheme = () => {
  currentTheme.value = currentTheme.value === 'light' ? 'dark' : 'light';
};

onMounted(() => {
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
