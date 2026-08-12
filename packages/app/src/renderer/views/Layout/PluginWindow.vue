<template>
  <v-app>
    <v-system-bar class="system-bar p-0" v-if="!isEmbedded">
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
import { watchWindowControlsOverlay } from '@/utils/windowControlsOverlay';

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

    let stopWindowControlsWatch = null;

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
      stopWindowControlsWatch = watchWindowControlsOverlay();
      store.pageTransitionActive = false;
    });

    onUnmounted(() => {
      stopWindowControlsWatch?.();
      store.pageTransitionActive = false;
    });

    return {
      plugin,
      onEnter,
      onLeave,
      isEmbedded,
    };
  },
};
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
