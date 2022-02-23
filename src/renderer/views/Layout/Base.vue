<template>
  <v-app>
    <v-system-bar app class="system-bar pa-0">
      <div class="px-4">translime</div>

      <v-spacer />

      <v-icon class="action-btn" @click="showNotification">notifications</v-icon>

      <window-controls :is-maximize="isMaximize"></window-controls>
    </v-system-bar>

    <navigation />

    <v-main class="fill-height">
      <notification />

      <div class="d-flex flex-column fill-height" id="app-main-container">
        <div class="scroll-content flex">
          <v-scroll-y-transition mode="out-in">
            <keep-alive>
              <router-view :key="$route.fullPath" />
            </keep-alive>
          </v-scroll-y-transition>
        </div>
      </div>
    </v-main>

    <main-footer />
  </v-app>
</template>

<script>
import WindowControls from '@/components/WindowControls.vue';
import MainFooter from '@/components/MainFooter.vue';
import Navigation from '@/views/Layout/components/Navigation.vue';
import Notification from '@/views/Layout/components/Notification.vue';
import { useIpc } from '@/hooks/electron';

const ipc = useIpc();

export default {
  name: 'Base',

  components: {
    Navigation,
    Notification,
    MainFooter,
    WindowControls,
  },

  data: () => ({
    isMaximize: false,
  }),

  methods: {
    onMaximizeStatusChange() {
      ipc.on('set-maximize-status', (maximize) => {
        this.isMaximize = maximize;
      });
    },
    onMounted() {
      this.onMaximizeStatusChange();
    },
    onUnmounted() {
      ipc.detach('set-maximize-status');
    },
    showNotification() {
      this.$store.commit('alert/setDrawerVisible', true);
    },
  },

  mounted() {
    this.onMounted();
  },

  destroyed() {
    this.onUnmounted();
  },
};
</script>

<style scoped lang="scss">
.system-bar {
  -webkit-app-region: drag;
  z-index: 300;

  .action-btn {
    -webkit-app-region: no-drag;
  }
}

#app-main-container > .scroll-content {
  min-height: 0;
  overflow-y: auto;

  &::-webkit-scrollbar {
    background-color: transparent;
  }
}
</style>
