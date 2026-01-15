<template>
  <v-container fluid class="about">
    <template v-if="isDev">
      <h2>开发</h2>

      <div class="mt-4">
        <v-btn class="ma-2" color="primary" @click="testAlert">
          发送 alert
        </v-btn>

        <v-btn class="ma-2" color="primary" @click="testToast">
          发送 toast
        </v-btn>

        <v-btn class="ma-2" color="primary" @click="testConfirm">
          发送 confirm
        </v-btn>

        <v-btn class="ma-2" color="primary" @click="appDir">
          打开 app 目录
        </v-btn>

        <v-btn class="ma-2" color="primary" @click="reloadApp">
          重载
        </v-btn>
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

    <h2 class="mt-2">
      更新
    </h2>

    <div class="mt-4">
      <div v-if="updateStatus === 'checking'">
        正在检查更新...
      </div>
      <div v-else-if="updateStatus === 'available'">
        发现新版本: v{{ updateInfo.version }}
        <v-btn
          size="small"
          color="primary"
          class="ml-2"
          :loading="downloading"
          @click="startDownload"
        >
          下载更新
        </v-btn>
      </div>
      <div v-else-if="updateStatus === 'not-available'">
        当前已是最新版本
      </div>
      <div v-else-if="updateStatus === 'downloading'">
        正在下载: {{ downloadProgress.percent.toFixed(1) }}%
        <v-progress-linear
          v-model="downloadProgress.percent"
          color="primary"
          height="10"
          striped
          class="mt-2"
        />
      </div>
      <div v-else-if="updateStatus === 'downloaded'">
        更新已下载
        <v-btn
          size="small"
          color="success"
          class="ml-2"
          @click="quitAndInstall"
        >
          重启并更新
        </v-btn>
      </div>
      <div v-else-if="updateStatus === 'error'">
        检查更新出错: {{ updateError }}
      </div>
      <div v-else>
        <v-btn size="small" @click="checkForUpdate">
          检查更新
        </v-btn>
      </div>
    </div>

    <h2 class="mt-2">
      链接
    </h2>

    <div class="mt-4">
      <div>
        <strong>github</strong>: <a href="javascript:;" @click="githubLink">https://github.com/slime7/translime <v-icon size="16">open_in_new</v-icon></a>
      </div>
    </div>
  </v-container>
</template>

<script>
import { onMounted, ref, version as vueVersion } from 'vue';
import { version as vuetifyVersion } from 'vuetify';
import * as ipcType from '@pkg/share/utils/ipcConstant';
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
    const getVersions = async () => {
      const result = await ipc.invoke(ipcType.APP_VERSIONS);
      versions.value = result;
      versions.value.vue = vueVersion;
      versions.value.vuetify = vuetifyVersion;
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

    // 自动更新逻辑
    const updateStatus = ref(''); // checking, available, not-available, downloading, downloaded, error
    const updateInfo = ref({});
    const downloadProgress = ref({ percent: 0 });
    const updateError = ref('');
    const downloading = ref(false);

    const initAutoUpdate = () => {
      ipc.on(ipcType.UPDATE_CHECKING, () => {
        updateStatus.value = 'checking';
      });
      ipc.on(ipcType.UPDATE_AVAILABLE, (info) => {
        updateStatus.value = 'available';
        updateInfo.value = info;
        toast.show(`发现新版本 v${info.version}`, 'info');
      });
      ipc.on(ipcType.UPDATE_NOT_AVAILABLE, () => {
        updateStatus.value = 'not-available';
      });
      ipc.on(ipcType.UPDATE_ERROR, (err) => {
        updateStatus.value = 'error';
        updateError.value = err;
      });
      ipc.on(ipcType.UPDATE_DOWNLOAD_PROGRESS, (progress) => {
        updateStatus.value = 'downloading';
        downloadProgress.value = progress;
        downloading.value = true;
      });
      ipc.on(ipcType.UPDATE_DOWNLOADED, (info) => {
        updateStatus.value = 'downloaded';
        updateInfo.value = info;
        downloading.value = false;
        toast.show('更新已下载，请重启安装', 'success');
      });
    };

    const startDownload = () => {
      downloading.value = true;
      ipc.send(ipcType.START_DOWNLOAD_UPDATE);
    };

    const quitAndInstall = () => {
      ipc.send(ipcType.QUIT_AND_INSTALL);
    };

    const checkForUpdate = () => {
      ipc.send(ipcType.CHECK_FOR_UPDATE);
    };

    onMounted(() => {
      getVersions();
      initAutoUpdate();
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
      // update
      updateStatus,
      updateInfo,
      downloadProgress,
      updateError,
      downloading,
      startDownload,
      quitAndInstall,
      checkForUpdate,
    };
  },
};
</script>
