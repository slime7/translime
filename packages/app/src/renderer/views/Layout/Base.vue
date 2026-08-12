<template>
  <v-app>
    <v-system-bar class="system-bar p-0">
      <div class="px-4">
        translime
      </div>

      <v-spacer />

      <!-- 预留原生 caption 按钮区域，避免内容被遮挡 -->
      <div class="window-control-placeholder shrink-0" />
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
  nextTick,
  onMounted,
  onUnmounted,
} from 'vue';
import MainFooter from '@/components/MainFooter.vue';
import Navigation from '@/views/Layout/components/Navigation.vue';
import Notification from '@/views/Layout/components/Notification.vue';
import useGlobalStore from '@/store/globalStore';
import EmbeddedPluginWebviews from '@/views/plugins/EmbeddedPluginWebviews.vue';
import { watchWindowControlsOverlay } from '@/utils/windowControlsOverlay';

const store = useGlobalStore();

let stopWindowControlsWatch = null;

const onEnter = () => {
  nextTick(() => {
    store.pageTransitionActive = false;
  });
};

const onLeave = () => {
  store.pageTransitionActive = true;
};

onMounted(() => {
  document.body.className = 'custom-title-bar';
  stopWindowControlsWatch = watchWindowControlsOverlay();
});

onUnmounted(() => {
  stopWindowControlsWatch?.();
});
</script>

<style scoped>
.system-bar {
  -webkit-app-region: drag;
  z-index: 300;
  height: var(--title-bar-height, 32px);
}

.window-control-placeholder {
  width: var(--window-control-width, 138px);
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
