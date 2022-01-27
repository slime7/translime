<template>
  <router-view />
</template>

<script>
const { ipcRenderer } = window.electron;

export default {
  name: 'app',

  methods: {
    initAppConfig() {
      this.$store.dispatch('initAppConfig');
    },
    remoteConsoleListener() {
      this.$ipcRenderer.on('console', ({ type, args }) => {
        // eslint-disable-next-line no-console
        console[type](...args);
      });
    },
  },

  created() {
    this.remoteConsoleListener();
    this.initAppConfig();
  },

  mounted() {
    ipcRenderer.send('main-renderer-ready');
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
