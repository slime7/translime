<template>
  <mat-app-root>
    <!-- 简洁的预览模式提示 -->
    <header class="preview-banner">
      <span>Preview 模式 - Electron API 已 mock</span>
      <mat-btn
        icon
        variant="standard"
        :aria-label="currentTheme === 'light' ? '切换到深色主题' : '切换到浅色主题'"
        @click="toggleTheme"
      >
        {{ currentTheme === 'light' ? 'dark_mode' : 'light_mode' }}
      </mat-btn>
    </header>

    <!-- 插件组件 -->
    <component
      :is="pluginComponent"
      v-if="pluginComponent"
    />
    <div
      v-else
      class="preview-loading"
    >
      加载中...
    </div>
  </mat-app-root>
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
.preview-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 8px 4px 16px;
  color: var(--mat-sys-color-on-primary-container);
  background: var(--mat-sys-color-primary-container);
}

.preview-banner > span {
  flex-grow: 1;
  font: var(--mat-sys-typescale-body-small);
}

.preview-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  block-size: 200px;
  color: var(--mat-sys-color-on-surface-variant);
}
</style>
