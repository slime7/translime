<template>
  <!-- 标题栏置于 app-root 之外：模态层、帷幕与浮动组件的应用矩形不包含标题栏 -->
  <div class="flex flex-col h-full">
    <div
      v-if="useCustomTitleBar"
      class="system-bar flex-none flex items-center bg-surface-container"
      :style="{ height: `${titleBarHeight}px` }"
      @dblclick="onToggleMaximize"
    >
      <div class="px-4">
        translime
      </div>

      <div class="grow" />

      <!-- 原生 WCO 活跃时预留 caption 区域，否则使用自定义 WindowControls 降级 -->
      <div
        v-if="hasNativeOverlay"
        class="window-control-placeholder shrink-0"
      />
      <window-controls
        v-else
        :is-maximize="isMaximize"
        win="app"
      />
    </div>

    <!-- fillViewport=false 时块轴高度由父级 flex 布局提供（标题栏以外的剩余空间） -->
    <mat-app-root
      scrollable
      :fill-viewport="false"
      class="flex-1 min-h-0"
    >
      <div class="flex flex-col h-full">
        <div class="flex flex-1 min-h-0">
          <navigation />

          <main class="flex-1 min-w-0 h-full">
            <notification />

            <div id="app-main-container" class="flex flex-col h-full">
              <router-view v-slot="{ Component, route }">
                <!-- 普通页面的正文滚动由 mat-scroll-area 承担，页面留白由其视口内边距统一提供；插件壳页面保持不滚动的 flex 容器 -->
                <component
                  :is="route.meta?.layoutMode === 'plugin-shell' ? 'div' : 'mat-scroll-area'"
                  :class="route.meta?.layoutMode === 'plugin-shell' ? 'page-shell' : 'page-scroll'"
                >
                  <div
                    :class="[
                      'content-stage',
                      { 'content-stage--plugin-shell': route.meta?.layoutMode === 'plugin-shell' },
                    ]"
                  >
                    <div :class="['route-stage', { 'route-stage--plugin': route.meta?.layoutMode === 'plugin-shell' }]">
                      <transition
                        name="page-blur"
                        mode="out-in"
                        @after-enter="onEnter"
                        @before-leave="onLeave"
                      >
                        <keep-alive>
                          <component :is="Component" :key="route.path" />
                        </keep-alive>
                      </transition>

                      <embedded-plugin-webviews />
                    </div>
                  </div>
                </component>
              </router-view>
            </div>
          </main>
        </div>

        <main-footer />
      </div>
    </mat-app-root>
  </div>
</template>

<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
} from 'vue';
import MainFooter from '@/components/MainFooter.vue';
import Navigation from '@/views/Layout/components/Navigation.vue';
import Notification from '@/views/Layout/components/Notification.vue';
import useGlobalStore from '@/store/globalStore';
import EmbeddedPluginWebviews from '@/views/plugins/EmbeddedPluginWebviews.vue';
import { useTitleBarHeight } from '@/hooks/useTitleBarHeight';
import WindowControls from '@/components/WindowControls.vue';
import { useIpc } from '@/hooks/electron';

const store = useGlobalStore();
const ipc = useIpc();
const isLinux = typeof window !== 'undefined' && (
  window.electron?.platform === 'linux'
  || window.electron?.versions?.platform === 'linux'
  || (typeof navigator !== 'undefined' && /linux/i.test(navigator.userAgent))
);
const useCustomTitleBar = computed(() => !isLinux);
const { height: titleBarHeight, hasNativeOverlay } = useTitleBarHeight();
const isMaximize = ref(false);

const onToggleMaximize = () => {
  if (window.ts?.windowControl) {
    window.ts.windowControl.maximize('app');
  }
};

const onEnter = () => {
  nextTick(() => {
    store.pageTransitionActive = false;
  });
};

const onLeave = () => {
  store.pageTransitionActive = true;
};

onMounted(() => {
  if (useCustomTitleBar.value) {
    document.body.className = 'custom-title-bar';
  } else {
    document.body.className = '';
  }
  ipc.on('set-maximize-status', (maximize) => {
    isMaximize.value = Boolean(maximize);
  });
});

onUnmounted(() => {
  ipc.detach('set-maximize-status');
});
</script>

<style scoped>
.system-bar {
  -webkit-app-region: drag;
}

.window-control-placeholder {
  width: calc(100vw - env(titlebar-area-width, 100vw));
  flex-shrink: 0;
}

/* 普通页面的滚动由 mat-scroll-area 承担，这里只提供 flex 高度约束 */
.page-scroll {
  flex: 1 1 auto;
  min-height: 0;
}

.page-shell {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.content-stage {
  width: 100%;
  min-height: 100%;
}

.content-stage--plugin-shell {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.route-stage {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.route-stage--plugin {
  /* 插件壳必须撑满 content-stage，标题栏固定、webview 占满剩余空间 */
  flex: 1 1 auto;
  min-height: 0;
}
</style>
