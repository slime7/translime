<template>
  <v-app>
    <v-system-bar app class="system-bar pa-0">
      <div class="px-4">translime</div>

      <v-spacer />

      <window-controls :is-maximize="isMaximize"></window-controls>
    </v-system-bar>

    <v-main class="fill-height">
      <div class="d-flex flex-column fill-height" id="app-main-container">
        <div class="scroll-content flex">
          <plugin-page :packageName="'translime-plugin-example'" />
        </div>
      </div>
    </v-main>
  </v-app>
</template>

<script>
import WindowControls from '@/components/WindowControls.vue';
import PluginPage from '@/views/plugins/PluginPage.vue';

export default {
  name: 'PluginWindow',

  components: {
    PluginPage,
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

<style lang="scss">
@import "./assets/fonts/robot/robot.css";
@import "./assets/fonts/noto sans sc/noto_sans_sc.css";
@import "./assets/fonts/source code pro/source_code_pro.css";

html {
  overflow-y: auto !important;
}

#app {
  height: 100vh;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  & > .v-dialog__content {
    top: 24px;
  }
}

#app pre {
  font-family: "Source Code Pro", "Noto Sans SC", monospace;
  margin: 0;
  user-select: text;
}

::-webkit-scrollbar {
  width: 16px;
  background-color: #fff;
}

::-webkit-scrollbar-thumb {
  height: 56px;
  border-radius: 8px;
  border: 4px solid transparent;
  background-clip: content-box;
  background-color: #606060;
}

::-webkit-scrollbar-thumb:hover {
  background-color: #606060cc;
}

a {
  -webkit-user-drag: none;
}

.ease-animation {
  transition: all .25s cubic-bezier(.4, 0, .2, 1);
}
</style>
