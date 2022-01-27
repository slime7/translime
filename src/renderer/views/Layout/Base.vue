<template>
  <v-app>
    <v-system-bar app class="system-bar pa-0">
      <div class="px-4">translime</div>

      <v-spacer />

      <window-controls :is-maximize="isMaximize"></window-controls>
    </v-system-bar>

    <navigation />

    <v-main class="fill-height">
      <div class="d-flex flex-column fill-height" id="app-main-container">
        <div class="scroll-content flex">
          <v-scroll-y-transition hide-on-leave>
            <router-view />
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
import Navigation from '@/views/Layout/Navigation.vue';

export default {
  name: 'Base',

  components: {
    Navigation,
    MainFooter,
    WindowControls,
  },

  data: () => ({
    isMaximize: false,
  }),

  methods: {
    onMaximizeStatusChange() {
      this.$ipcRenderer.on('set-maximize-status', (maximize) => {
        this.isMaximize = maximize;
      });
    },
    onMounted() {
      this.onMaximizeStatusChange();
    },
    onUnmounted() {
      this.$ipcRenderer.detach('set-maximize-status');
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
}

#app-main-container > .scroll-content {
  min-height: 0;
  overflow-y: auto;

  &::-webkit-scrollbar {
    background-color: transparent;
  }
}
</style>
