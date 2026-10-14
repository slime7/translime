import { acceptHMRUpdate, defineStore } from 'pinia';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useToast from '@/hooks/useToast';

const useUpdateStore = defineStore('updateStore', {
  state: () => ({
    // 与 electron-updater 事件一一对应；空串表示尚未检查
    status: '',
    info: {},
    downloadProgress: { percent: 0 },
    error: '',
    downloading: false,
    listenersReady: false,
  }),
  getters: {
    // 新版本已发现且尚未随重启安装完成，期间侧栏关于入口保持点型角标
    hasUpdate: (state) => ['available', 'downloading', 'downloaded'].includes(state.status),
  },
  actions: {
    // 主窗口启动时注册一次：更新事件不再依赖关于页是否打开过
    initListeners() {
      if (this.listenersReady) {
        return;
      }
      this.listenersReady = true;
      const ipc = useIpc();
      const toast = useToast();

      ipc.on(ipcType.UPDATE_CHECKING, () => {
        this.status = 'checking';
      });
      ipc.on(ipcType.UPDATE_AVAILABLE, (info) => {
        this.status = 'available';
        this.info = info;
        toast.show(`发现新版本 v${info.version}`);
      });
      ipc.on(ipcType.UPDATE_NOT_AVAILABLE, () => {
        this.status = 'not-available';
      });
      ipc.on(ipcType.UPDATE_ERROR, (err) => {
        this.status = 'error';
        this.error = err;
      });
      ipc.on(ipcType.UPDATE_DOWNLOAD_PROGRESS, (progress) => {
        this.status = 'downloading';
        this.downloadProgress = progress;
        this.downloading = true;
      });
      ipc.on(ipcType.UPDATE_DOWNLOADED, (info) => {
        this.status = 'downloaded';
        this.info = info;
        this.downloading = false;
        toast.show('更新已下载，下次启动时自动生效');
      });
    },
    startDownload() {
      this.downloading = true;
      useIpc().send(ipcType.START_DOWNLOAD_UPDATE);
    },
    quitAndInstall() {
      useIpc().send(ipcType.QUIT_AND_INSTALL);
    },
    checkForUpdate() {
      useIpc().send(ipcType.CHECK_FOR_UPDATE);
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUpdateStore, import.meta.hot));
}

export default useUpdateStore;
