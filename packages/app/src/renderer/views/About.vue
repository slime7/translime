<template>
  <mat-container class="about">
    <div class="columns-1 lg:columns-2 gap-4 mx-auto max-w-204">
      <div class="mb-4 break-inside-avoid w-full max-w-100 mx-auto">
        <mat-card
          class="rounded-3xl flow-root"
          color="surface-container"
        >
          <template #headline>
            版本
          </template>

          <mat-card-content>
            <div class="mb-2">
              <h1 class="text-mat-headline-small">
                Translime
              </h1>
            </div>

            <div>
              <strong>version: </strong> {{ versions.app }}
            </div>
            <div>
              <strong>github</strong>: <a href="javascript:;" @click="githubLink">https://github.com/slime7/translime <mat-icon size="1em" aria-hidden="true">open_in_new</mat-icon></a>
            </div>

            <div class="mt-4">
              <div v-if="updateStatus === 'checking'">
                正在检查更新...
              </div>

              <div v-else-if="updateStatus === 'available'">
                <div>
                  <mat-btn
                    data-test="about-download-update-btn"
                    :loading="downloading"
                    @click="startDownload"
                  >
                    下载更新
                  </mat-btn>
                </div>
                <div class="mt-2">
                  发现新版本: v{{ updateInfo.version }}
                </div>
              </div>

              <div v-else-if="updateStatus === 'not-available'">
                <div>
                  <mat-btn data-test="about-check-update-btn" @click="checkForUpdate">
                    检查更新
                  </mat-btn>
                </div>
                <div class="mt-2">
                  当前已是最新版本
                </div>
              </div>

              <div v-else-if="updateStatus === 'downloading'">
                正在下载: {{ downloadProgress.percent.toFixed(1) }}%
                <mat-progress
                  variant="linear"
                  :value="downloadProgress.percent / 100"
                  color="primary"
                  class="mt-2"
                />
              </div>

              <div v-else-if="updateStatus === 'downloaded'">
                <div class="mb-2">
                  更新已下载，将在下次启动时自动生效
                </div>
                <div>
                  <mat-btn
                    :color="STATUS_SUCCESS"
                    data-test="about-restart-update-btn"
                    @click="quitAndInstall"
                  >
                    立即重启
                  </mat-btn>
                </div>
              </div>

              <div v-else-if="updateStatus === 'error'">
                <div>
                  <mat-btn data-test="about-check-update-btn" @click="checkForUpdate">
                    检查更新
                  </mat-btn>
                </div>
                <div class="mt-2">
                  检查更新出错: {{ updateError }}
                </div>
              </div>

              <div v-else>
                <mat-btn data-test="about-check-update-btn" @click="checkForUpdate">
                  检查更新
                </mat-btn>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <div class="mb-4 break-inside-avoid w-full max-w-100 mx-auto">
        <mat-card
          class="rounded-3xl flow-root"
          color="surface-container"
        >
          <template #headline>
            开发
          </template>

          <mat-card-content>
            <p class="break-all mb-4 text-mat-body-medium">
              启动命令：{{ appArgv.join(' ') }}
            </p>

            <div
              v-for="([lib, version]) in Object.entries(versions).filter(([lib]) => lib !== 'app')"
              :key="lib"
            >
              <strong>{{ lib }}</strong>: v{{ version }}
            </div>

            <div
              class="mt-4 space-y-2"
            >
              <div
                v-if="isDev"
              >
                <mat-btn color="primary" @click="testAlert">
                  发送 alert
                </mat-btn>
              </div>
              <div
                v-if="isDev"
              >
                <mat-btn color="primary" @click="testToast">
                  发送 toast
                </mat-btn>
              </div>
              <div
                v-if="isDev"
              >
                <mat-btn color="primary" @click="testConfirm">
                  发送 confirm
                </mat-btn>
              </div>
              <div>
                <mat-btn color="primary" @click="appDir">
                  打开 app 目录
                </mat-btn>
              </div>
              <div>
                <mat-btn color="primary" data-test="about-open-log-btn" @click="openLogViewer">
                  查看日志
                </mat-btn>
              </div>
              <div
                v-if="isDev"
              >
                <mat-btn color="primary" @click="reloadApp">
                  重载
                </mat-btn>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  </mat-container>
</template>

<script>
import { onMounted, ref, version as vueVersion } from 'vue';
import { useRouter } from 'vue-router';
import { version as vuetifyVersion } from 'vuetify';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import globalStore from '@/store/globalStore';
import useDialog from '@/hooks/useDialog';
import useAlert from '@/hooks/useAlert';
import useToast from '@/hooks/useToast';
import { STATUS_SUCCESS } from '@/utils/statusColors';

export default {
  name: 'AppAbout',

  setup() {
    const ipc = useIpc();
    const router = useRouter();
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
    const openLogViewer = () => {
      router.push({
        name: 'LogViewer',
      });
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
        toast.show(`发现新版本 v${info.version}`);
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
        toast.show('更新已下载，下次启动时自动生效');
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
      STATUS_SUCCESS,
      versions,
      testAlert,
      testToast,
      testConfirm,
      reloadApp,
      appDir,
      openLogViewer,
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
