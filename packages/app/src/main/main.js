import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  screen,
  systemPreferences,
} from 'electron';
import Store from 'electron-store';
import { join } from 'node:path';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import createProtocol from './utils/createProtocol';
import mainStore from './utils/useMainStore';
import appManager from './utils/useAppManager';
import logger from './utils/logger';
import Ipc from './core/Ipc';

const isInDisplay = (winProps) => {
  const displays = screen.getAllDisplays();
  let inDisplay = false;
  let appDisplayName = '';
  displays.forEach((display) => {
    const { workArea } = display;
    if (winProps.x >= workArea.x && winProps.x + 120 <= workArea.x + workArea.width) {
      if (winProps.y >= workArea.y && winProps.y + 80 <= workArea.y + workArea.height) {
        inDisplay = true;
        appDisplayName = display.label;
      }
    }
  });
  logger.info(`app current display: ${appDisplayName}`);
  return inDisplay;
};

export default () => {
  const { workArea } = screen.getPrimaryDisplay();
  const defaultWin = {
    x: workArea.width / 2 - 200,
    y: workArea.height / 2 - 300,
    width: 900,
    height: 600,
    maximize: false,
  };
  if (defaultWin.y < 0) {
    defaultWin.y = 0;
  }
  let {
    x,
    y,
    width,
    height,
    maximize,
  } = mainStore.config.get('window', defaultWin);
  maximize = false;
  const useNativeTitleBar = mainStore.config.get('setting.useNativeTitleBar', false);
  // 判断是否在屏幕视野内
  if (!isInDisplay({
    x, y, width, height,
  })) {
    x = defaultWin.x;
    y = defaultWin.y;
  }
  // Create the browser window.
  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: true,
    show: false,
    minWidth: 700,
    titleBarStyle: useNativeTitleBar ? 'default' : 'hidden',
    webPreferences: {
      preload: join(app.getAppPath(), 'dist/preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true,
    },
  });
  appManager.setWin(win);
  Store.initRenderer();
  const ipc = new Ipc(ipcMain, appManager.getWin().webContents);
  appManager.setIpc(ipc);

  appManager.getWin().on('maximize', () => {
    maximize = true;
    ipc.sendToClient('set-maximize-status', true);
  });

  appManager.getWin().on('unmaximize', () => {
    maximize = false;
    ipc.sendToClient('set-maximize-status', false);
  });

  ipcMain.handle('appConfigStore', (event, method, ...rest) => mainStore.config[method](...rest));

  nativeTheme.on('updated', () => {
    if (appManager.getIpc()) {
      const themeAndColor = {
        dark: nativeTheme.shouldUseDarkColors,
        color: `#${systemPreferences.getAccentColor().substring(0, 6)}`,
      };
      appManager.getIpc().sendToAllWindows(ipcType.THEME_UPDATED, themeAndColor);
    }
  });

  if (import.meta.env.VITE_DEV_SERVER_URL !== undefined) {
    // Load the url of the dev server if in development mode
    appManager.getWin().loadURL(import.meta.env.VITE_DEV_SERVER_URL);
    if (!process.env.IS_TEST) {
      appManager.getWin().webContents.openDevTools({ mode: 'undocked' });
    }
  } else {
    createProtocol('app');
    // Load the index.html when not in development
    appManager.getWin().loadURL('app://./index.html');
  }
  appManager.getWin().setMenu(null);

  appManager.getWin().on('close', (event) => {
    const minimizeToTrayOnClose = mainStore.config.get('setting.minimizeToTrayOnClose', false);
    if (minimizeToTrayOnClose && !appManager.state.isQuitting) {
      event.preventDefault();
      appManager.getWin().hide();
    }

    if (!maximize) {
      const pos = appManager.getWin().getPosition();
      const size = appManager.getWin().getSize();
      [x, y, width, height] = [...pos, ...size];
    }
    mainStore.config.set('window', {
      x,
      y,
      width,
      height,
      maximize,
    });
  });

  appManager.getWin().on('closed', () => {
    appManager.setWin(null);
    app.quit();
  });
};
