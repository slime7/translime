import {
  app,
  Menu,
  nativeImage,
  Tray,
} from 'electron';
import icon from '@pkg/share/static/icon.png';
import mainStore from '../utils/useMainStore';
import appManager from '../utils/useAppManager';
import logger from '../utils/logger';

const createTray = () => {
  try {
    const trayInstance = new Tray(nativeImage.createFromDataURL(icon));
    appManager.setTray(trayInstance);

    // dev 实例在托盘上显式标记，便于与安装版共存时区分
    const displayName = import.meta.env.DEV ? 'translime (dev)' : 'translime';

    const items = [
      {
        label: displayName,
        enabled: false,
      },
      {
        type: 'separator',
      },
      {
        label: '打开',
        click() {
          if (appManager.getWin()) {
            if (appManager.getWin().isMinimized()) {
              appManager.getWin().restore();
            }
            appManager.getWin().show();
            appManager.getWin().focus();
          }
        },
      },
      {
        label: '退出',
        click() {
          app.quit();
        },
      },
    ];
    const menu = Menu.buildFromTemplate(items);

    trayInstance.setToolTip(`${displayName} ${mainStore.APP_VERSION}`);
    trayInstance.setContextMenu(menu);
    trayInstance.on('click', () => {
      if (appManager.getWin()) {
        if (appManager.getWin().isMinimized()) {
          appManager.getWin().restore();
        }
        appManager.getWin().show();
        appManager.getWin().focus();
      }
    });
    trayInstance.on('double-click', () => {
      if (appManager.getWin()) {
        if (appManager.getWin().isMinimized()) {
          appManager.getWin().restore();
        }
        appManager.getWin().show();
        appManager.getWin().focus();
      }
    });
  } catch (err) {
    logger.warn('系统托盘初始化失败或当前环境不支持 Tray', err);
    appManager.setTray(null);
  }
};

export default createTray;
