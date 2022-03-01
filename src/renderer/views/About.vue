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
import { getUuiD } from '@pkg/share/utils';
import mixins from '@/mixins';
import { useIpc } from '@/hooks/electron';
import useDialog from '@/hooks/useDialog';

const ipc = useIpc();
const { confirm } = useDialog();

export default {
  name: 'About',

  mixins: [mixins],

  data: () => ({
    versions: {},
    versionsIpcId: `${ipcType.APP_VERSIONS}-${getUuiD()}`,
  }),

  methods: {
    testAlert() {
      this.alert('测试 alert');
    },
    async testConfirm() {
      // const result = await this.confirm('测试 confirm');
      const result = await confirm('测试 confirm');
      console.log('confirm result: ', result);
    },
    reloadApp() {
      ipc.send(ipcType.RELOAD);
    },
    appDir() {
      ipc.send(ipcType.OPEN_APP_PATH);
    },
    getVersions() {
      ipc.send(ipcType.APP_VERSIONS, this.versionsIpcId);
    },
    onGetVersions() {
      ipc.on(this.versionsIpcId, (versions) => {
        this.versions = versions;
      });
    },
  },

  mounted() {
    this.onGetVersions();
    this.getVersions();
  },
};
</script>
