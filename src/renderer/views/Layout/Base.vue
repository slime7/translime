<template>
  <v-app>
    <v-system-bar class="system-bar pa-0" v-if="!useNativeTileBar">
      <div class="px-4">translime</div>

      <v-spacer />

      <window-controls :is-maximize="isMaximize"></window-controls>
    </v-system-bar>

    <navigation />

    <v-main class="h-screen">
      <notification />

      <div class="d-flex flex-column fill-height" id="app-main-container">
        <div class="scroll-content flex">
          <router-view v-slot="{ Component, route }">
            <v-fade-transition
              mode="out-in"
              @after-enter="onEnter"
              @before-leave="onLeave"
            >
              <keep-alive>
                <component :is="Component" :key="route.path" />
              </keep-alive>
            </v-fade-transition>
          </router-view>
        </div>
      </div>
    </v-main>

    <main-footer />
  </v-app>
</template>

<script>
import {
  nextTick,
  ref,
  onMounted,
  onUnmounted,
  computed,
  watch,
} from 'vue';
import { useRoute } from 'vue-router';
import WindowControls from '@/components/WindowControls.vue';
import MainFooter from '@/components/MainFooter.vue';
import Navigation from '@/views/Layout/components/Navigation.vue';
import Notification from '@/views/Layout/components/Notification.vue';
import useGlobalStore from '@/store/globalStore';
import { useIpc } from '@/hooks/electron';

export default {
  name: 'LayoutBase',

  components: {
    Navigation,
    Notification,
    MainFooter,
    WindowControls,
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

#app-main-container > .scroll-content {
  min-height: 0;
  overflow-y: auto;

  &::-webkit-scrollbar {
    background-color: transparent;
  }
}
</style>
