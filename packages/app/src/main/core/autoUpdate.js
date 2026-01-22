import { autoUpdater } from 'electron-updater';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import appManager from '../utils/useAppManager';
import logger from '../utils/logger';

// 配置日志
autoUpdater.logger = logger;
// autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false; // 默认不自动下载，需要用户确认或我们手动控制

export const checkForUpdates = () => {
  // 开发环境下通常不检查更新，或者需要特殊配置
  if (import.meta.env.DEV) {
    logger.info('Skipping update check in development mode');
    // 可以取消注释下面这行来在开发环境测试（需要配置 dev-app-update.yml）
    // autoUpdater.checkForUpdates();
    return;
  }
  try {
    autoUpdater.checkForUpdates();
  } catch (error) {
    logger.error('Check for updates failed', error);
  }
};

export const init = () => {
  const sendToWindow = (type, data = null) => {
    const ipc = appManager.getIpc();
    if (ipc) {
      ipc.sendToMain(type, data);
    } else {
      logger.warn('IPC not initialized, cannot send update status');
    }
  };

  // 正在检查更新
  autoUpdater.on('checking-for-update', () => {
    logger.info('Checking for update...');
    sendToWindow(ipcType.UPDATE_CHECKING);
  });

  // 发现新版本
  autoUpdater.on('update-available', (info) => {
    logger.info('Update available.', info);
    sendToWindow(ipcType.UPDATE_AVAILABLE, info);
    // 这里可以选择自动下载，或者由前端触发下载
    // autoUpdater.downloadUpdate();
  });

  // 没有新版本
  autoUpdater.on('update-not-available', (info) => {
    logger.info('Update not available.', info);
    sendToWindow(ipcType.UPDATE_NOT_AVAILABLE, info);
  });

  // 更新出错
  autoUpdater.on('error', (err) => {
    logger.error(`Error in auto-updater. ${err}`);
    sendToWindow(ipcType.UPDATE_ERROR, err.toString());
  });

  // 下载进度
  autoUpdater.on('download-progress', (progressObj) => {
    let logMessage = `Download speed: ${progressObj.bytesPerSecond}`;
    logMessage = `${logMessage} - Downloaded ${progressObj.percent}%`;
    logMessage = `${logMessage} (${progressObj.transferred}/${progressObj.total})`;
    logger.info(logMessage);
    sendToWindow(ipcType.UPDATE_DOWNLOAD_PROGRESS, progressObj);
  });

  // 下载完成
  autoUpdater.on('update-downloaded', (info) => {
    logger.info('Update downloaded', info);
    sendToWindow(ipcType.UPDATE_DOWNLOADED, info);
  });
};

export default {
  [ipcType.START_DOWNLOAD_UPDATE]() {
    autoUpdater.downloadUpdate();
  },
  [ipcType.QUIT_AND_INSTALL]() {
    autoUpdater.quitAndInstall();
  },
  [ipcType.CHECK_FOR_UPDATE]() {
    checkForUpdates();
  },
};
