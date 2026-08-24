<template>
  <v-app>
    <v-system-bar
      v-if="!isEmbedded && useCustomTitleBar"
      class="system-bar p-0"
      :height="titleBarHeight"
      @dblclick="onToggleMaximize"
    >
      <div class="px-4">
        {{ plugin ? `${plugin.title} - translime` : 'translime' }}
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
        :win="`plugin-window-${packageName}`"
      />
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
  ref,
} from 'vue';
import { useRoute } from 'vue-router';
import * as components from 'vuetify/components';
import * as labsComponents from 'vuetify/labs/components';
import * as directives from 'vuetify/directives';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import globalStore from '@/store/globalStore';
import { useTitleBarHeight } from '@/hooks/useTitleBarHeight';
import WindowControls from '@/components/WindowControls.vue';
import { useIpc } from '@/hooks/electron';

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
  components: {
    WindowControls,
  },

  setup() {
    const route = useRoute();
    const ipc = useIpc();
    const store = globalStore();

    const packageName = computed(() => route.params.packageName);
    const plugin = computed(() => store.plugin(packageName.value));
    const isEmbedded = computed(() => route.query.embedded === 'true');
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
        window.ts.windowControl.maximize(`plugin-window-${packageName.value}`);
      }
    };

    const applyCustomTitleBar = () => {
      document.body.className = (!isEmbedded.value && useCustomTitleBar.value) ? 'custom-title-bar' : '';
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
      ipc.on(`set-maximize-status:plugin-window-${packageName.value}`, (maximize) => {
        isMaximize.value = Boolean(maximize);
      });
      ipc.invoke(ipcType.APP_IS_MAXIMIZE, `plugin-window-${packageName.value}`).then((res) => {
        isMaximize.value = Boolean(res);
      }).catch(() => {});
    });

    onUnmounted(() => {
      ipc.detach(`set-maximize-status:plugin-window-${packageName.value}`);
      store.pageTransitionActive = false;
    });

    return {
      plugin,
      packageName,
      isMaximize,
      onEnter,
      onLeave,
      isEmbedded,
      useCustomTitleBar,
      titleBarHeight,
      hasNativeOverlay,
      onToggleMaximize,
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
