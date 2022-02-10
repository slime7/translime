<template>
  <v-container fluid class="about">
    <template v-if="isDev">
      <h2>开发</h2>

      <div class="mt-4">
        <v-btn class="ma-2" color="primary" @click="testAlert">发送 alert</v-btn>

        <v-btn class="ma-2" color="primary" @click="testConfirm">发送 confirm</v-btn>

        <v-btn class="ma-2" color="primary" @click="appDir">打开 app 目录</v-btn>

        <v-btn class="ma-2" color="primary" @click="reloadApp">重载</v-btn>
      </div>
    </template>

    <h2>版本</h2>

    <div class="mt-4">
      <div
        v-for="(version, lib) in versions"
        :key="lib"
      >
        <strong>{{ lib }}</strong>: v{{ version }}
      </div>
    </div>
  </v-container>
</template>

<script>
import * as ipcType from '@pkg/share/utils/ipcConstant';
import mixins from '@/mixins';

export default {
  name: 'About',

  mixins: [mixins],

  data: () => ({
    versions: window.electron.versions,
  }),

  methods: {
    testAlert() {
      this.alert('测试 alert');
    },
    async testConfirm() {
      const result = await this.confirm('测试 confirm');
      console.log('confirm result: ', result);
    },
    reloadApp() {
      this.$ipcRenderer.send(ipcType.RELOAD);
    },
    appDir() {
      this.$ipcRenderer.send(ipcType.OPEN_APP_PATH);
    },
  },
};
</script>
