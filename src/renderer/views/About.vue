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
import { ref, onMounted } from '@vue/composition-api';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { getUuiD } from '@pkg/share/utils';
import { useIpc } from '@/hooks/electron';
import useDialog from '@/hooks/useDialog';
import useAlert from '@/hooks/useAlert';

export default {
  name: 'About',

  setup() {
    const ipc = useIpc();
    const dialog = useDialog();
    const alert = useAlert();

    // 版本
    const versions = ref({});
    const versionsIpcId = ref(`${ipcType.APP_VERSIONS}-${getUuiD()}`);
    const getVersions = () => {
      ipc.send(ipcType.APP_VERSIONS, versionsIpcId.value);
    };
    const onGetVersions = () => {
      ipc.on(versionsIpcId.value, (v) => {
        versions.value = v;
      });
    };

    // 测试方法
    const testAlert = () => {
      alert.show('测试 alert');
    };
    const testConfirm = async () => {
      // const result = await this.confirm('测试 confirm');
      const result = await dialog.showConfirm('测试 confirm');
      console.log('confirm result: ', result);
    };
    const reloadApp = () => {
      ipc.send(ipcType.RELOAD);
    };
    const appDir = () => {
      ipc.send(ipcType.OPEN_APP_PATH);
    };

    onMounted(() => {
      onGetVersions();
      getVersions();
    });

    return {
      isDev: process.env.NODE_ENV === 'development',
      versions,
      testAlert,
      testConfirm,
      reloadApp,
      appDir,
    };
  },
};
</script>
