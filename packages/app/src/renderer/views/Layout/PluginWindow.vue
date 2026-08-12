<template>
  <v-app>
    <v-system-bar
      v-if="!isEmbedded"
      class="system-bar p-0"
      :height="titleBarHeight"
    >
      <div class="px-4">
        {{ plugin ? `${plugin.title} - translime` : 'translime' }}
      </div>

      <v-spacer />

      <!-- 预留原生 caption 按钮区域，避免内容被遮挡 -->
      <div class="window-control-placeholder shrink-0" />
    </v-system-bar>

    <v-main class="h-screen">
      <div class="flex flex-col h-full" id="app-main-container">
        <div class="scroll-content scroll-content--plugin-window flex-auto">
          <router-view v-slot="{ Component, route }">
            <div class="route-stage route-stage--plugin-window">
              <v-fade-transition
                mode="out-in"
                @after-enter="onEnter"
                @before-leave="onLeave"
              >
                <component :is="Component" :key="route.path" />
              </v-fade-transition>
            </div>
          </router-view>
        </div>
      </div>
    </v-main>
  </v-app>
</template>

<script>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
} from 'vue';
import { useRoute } from 'vue-router';
import * as components from 'vuetify/components';
import * as labsComponents from 'vuetify/labs/components';
import * as directives from 'vuetify/directives';
import globalStore from '@/store/globalStore';
import { useTitleBarHeight } from '@/hooks/useTitleBarHeight';

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
  name: 'LayoutPluginWindow',

  setup() {
    const route = useRoute();
    const store = globalStore();

    const packageName = computed(() => route.params.packageName);
    const plugin = computed(() => store.plugin(packageName.value));
    const isEmbedded = computed(() => route.query.embedded === 'true');
    const { height: titleBarHeight } = useTitleBarHeight();

    const applyCustomTitleBar = () => {
      document.body.className = isEmbedded.value ? '' : 'custom-title-bar';
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
      applyCustomTitleBar();
      store.pageTransitionActive = false;
    });

    onUnmounted(() => {
      store.pageTransitionActive = false;
    });

    return {
      plugin,
      onEnter,
      onLeave,
      isEmbedded,
      titleBarHeight,
    };
  },
};
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

.scroll-content--plugin-window {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.route-stage {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.route-stage--plugin-window {
  flex: 1 1 auto;
}

.route-stage--plugin-window > * {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
