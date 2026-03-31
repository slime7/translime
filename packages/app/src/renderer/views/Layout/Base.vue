<template>
  <v-app>
    <v-system-bar class="system-bar p-0" v-if="!useNativeTileBar">
      <div class="px-4">
        translime
      </div>

      <v-spacer />

      <window-controls :is-maximize="isMaximize" />
    </v-system-bar>

    <navigation />

    <v-main class="h-screen">
      <notification />

      <div class="flex flex-col h-full" id="app-main-container">
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

<script>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue';
import { useRoute } from 'vue-router';
import WindowControls from '@/components/WindowControls.vue';
import MainFooter from '@/components/MainFooter.vue';
import Navigation from '@/views/Layout/components/Navigation.vue';
import Notification from '@/views/Layout/components/Notification.vue';
import useGlobalStore from '@/store/globalStore';
import { useIpc } from '@/hooks/electron';
import EmbeddedPluginWebviews from '@/views/plugins/EmbeddedPluginWebviews.vue';

export default {
  name: 'LayoutBase',

  components: {
    Navigation,
    Notification,
    MainFooter,
    WindowControls,
    EmbeddedPluginWebviews,
  },

  setup() {
    const store = useGlobalStore();
    const ipc = useIpc();
    const route = useRoute();

    const isMaximize = ref(false);
    const onMaximizeStatusChange = () => {
      ipc.on('set-maximize-status', (maximize) => {
        isMaximize.value = maximize;
      });
    };
    const plugin = computed(() => {
      if (route.params.packageName) {
        return store.plugin(route.params.packageName);
      }
      return null;
    });
    const onEnter = () => {
      nextTick(() => {
        store.pageTransitionActive = false;
      });
    };
    const onLeave = () => {
      store.pageTransitionActive = true;
    };
    const useNativeTileBar = computed(() => store.appSetting.useNativeTitleBar);
    watch(() => store.appSetting.useNativeTitleBar, () => {
      if (useNativeTileBar.value) {
        document.body.className = '';
      } else {
        document.body.className = 'custom-title-bar';
      }
    });

    onMounted(() => {
      onMaximizeStatusChange();
    });

    onUnmounted(() => {
      ipc.detach('set-maximize-status');
    });

    return {
      isMaximize,
      plugin,
      onEnter,
      onLeave,
      useNativeTileBar,
    };
  },
};
</script>

<style scoped lang="scss">
.system-bar {
  -webkit-app-region: drag;
  z-index: 300;
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
