<template>
  <v-app>
    <v-system-bar
      v-if="useCustomTitleBar"
      class="system-bar p-0"
      :height="titleBarHeight"
      @dblclick="onToggleMaximize"
    >
      <div class="px-4">
        translime
      </div>

      <v-spacer />

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
    </v-system-bar>

    <navigation />

    <v-main class="h-screen">
      <notification />

      <div id="app-main-container" class="flex flex-col h-full">
        <router-view v-slot="{ Component, route }">
          <div
            :class="[
              'scroll-content',
              'flex-auto',
              { 'scroll-content--plugin-shell': route.meta?.layoutMode === 'plugin-shell' },
            ]"
          >
            <div
              :class="[
                'content-stage',
                { 'content-stage--plugin-shell': route.meta?.layoutMode === 'plugin-shell' },
              ]"
            >
              <div :class="['route-stage', { 'route-stage--plugin': route.meta?.layoutMode === 'plugin-shell' }]">
                <v-fade-transition
                  mode="out-in"
                  @after-enter="onEnter"
                  @before-leave="onLeave"
                >
                  <keep-alive>
                    <component :is="Component" :key="route.path" />
                  </keep-alive>
                </v-fade-transition>
              </div>

              <embedded-plugin-webviews />
            </div>
          </div>
        </router-view>
      </div>
    </v-main>

    <main-footer />
  </v-app>
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

.scroll-content {
  min-height: 0;
  overflow-y: auto;

  &::-webkit-scrollbar {
    background-color: transparent;
  }
}

.content-stage {
  width: 100%;
  min-height: 100%;
}

.scroll-content--plugin-shell {
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
  flex: 0 0 auto;
}
</style>
