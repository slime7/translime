<template>
  <v-container fluid class="about">
    <template v-if="isDev">
      <h2>开发</h2>

      <div class="mt-4">
        <v-btn class="ma-2" color="primary" @click="testAlert">发送 alert</v-btn>

        <v-btn class="ma-2" color="primary" @click="testToast">发送 toast</v-btn>

        <v-btn class="ma-2" color="primary" @click="testConfirm">发送 confirm</v-btn>

        <v-btn class="ma-2" color="primary" @click="appDir">打开 app 目录</v-btn>

        <v-btn class="ma-2" color="primary" @click="reloadApp">重载</v-btn>
      </div>

      <p>启动命令：{{ appArgv.join(' ') }}</p>
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

    <h2 class="mt-2">链接</h2>

    <div class="mt-4">
      <div>
        <strong>github</strong>: <a href="javascript:;" @click="githubLink">https://github.com/slime7/translime <v-icon size="16">open_in_new</v-icon></a>
      </div>
    </div>
  </v-container>
</template>

<script>
import { ref, onMounted, version as vueVersion } from 'vue';
import { version as vuetifyVersion } from 'vuetify';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { getUuiD } from '@pkg/share/utils';
import { useIpc } from '@/hooks/electron';
import globalStore from '@/store/globalStore';
import useDialog from '@/hooks/useDialog';
import useAlert from '@/hooks/useAlert';
import useToast from '@/hooks/useToast';

export default {
  name: 'AppAbout',

  setup() {
    const ipc = useIpc();
    const store = globalStore();
    const dialog = useDialog();
    const alert = useAlert();
    const toast = useToast();

    // 版本
    const versions = ref({});
    const versionsIpcId = ref(`${ipcType.APP_VERSIONS}-${getUuiD()}`);
    const getVersions = () => {
      ipc.send(ipcType.APP_VERSIONS, versionsIpcId.value);
    };
    const onGetVersions = () => {
      ipc.on(versionsIpcId.value, (v) => {
        versions.value = v;
        versions.value.vue = vueVersion;
        versions.value.vuetify = vuetifyVersion;
      });
    };

    // 测试方法
    const testAlert = () => {
      alert.show('测试 alert');
    };
    const testToast = () => {
      toast.show('测试 toast');
    };
    const testConfirm = async () => {
      const result = await dialog.showConfirm('测试 confirm');
      console.log('confirm result: ', result);
    };
    const reloadApp = () => {
      ipc.send(ipcType.RELOAD);
    };
    const appDir = () => {
      ipc.send(ipcType.OPEN_APP_PATH);
    };
    const openLink = (url) => {
      ipc.send(ipcType.OPEN_LINK, { url });
    };
    const githubLink = () => {
      openLink('https://github.com/slime7/translime');
    };

    onMounted(() => {
      onGetVersions();
      getVersions();
    });

    return {
      isDev: process.env.NODE_ENV === 'development',
      versions,
      testAlert,
      testToast,
      testConfirm,
      reloadApp,
      appDir,
      githubLink,
      appArgv: store.appArgv,
    };
  },
};
</script>
