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
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}
</style>
