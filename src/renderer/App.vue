<template>
  <router-view />
</template>

<script>
export default {
  name: 'app',

  mounted() {
    window.electron.ipcRenderer.send('main-renderer-ready');
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
