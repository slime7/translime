import {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  nativeTheme,
  screen,
  systemPreferences,
} from 'electron';
import Store from 'electron-store';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import icon from '@pkg/share/static/icon.png';
import createProtocol from './utils/createProtocol';
import mainStore from './utils/useMainStore';
import appManager from './utils/useAppManager';
import logger from './utils/logger';
import Ipc from './core/Ipc';
import {
  resolveOverlayMode,
  resolveTitleBarOverlay,
} from './utils/titleBarOverlay';

const dir = dirname(fileURLToPath(import.meta.url));
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
  const isLinux = process.platform === 'linux';
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
  const settingTheme = mainStore.config.get('setting.theme', 'system');
  const overlayMode = resolveOverlayMode(settingTheme, nativeTheme.shouldUseDarkColors);
  const titleBarOverlay = resolveTitleBarOverlay({
    overlayMode,
    savedOverlay: mainStore.config.get(`window.overlayColor.${overlayMode}`),
  });
  // 判断是否在屏幕视野内
  if (!isInDisplay({
    x, y, width, height,
  })) {
    x = defaultWin.x;
    y = defaultWin.y;
  }
  // Create the browser window.
  const appIcon = nativeImage.createFromDataURL(icon);
  const winOptions = {
    width,
    height,
    frame: true,
    show: false,
    minWidth: 700,
    icon: appIcon,
    ...(isLinux ? {
      titleBarStyle: 'default',
    } : {
      titleBarStyle: 'hidden',
      titleBarOverlay,
    }),
    webPreferences: {
      preload: join(dir, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true,
    },
  };
  if (!isLinux && isInDisplay({
    x, y, width, height,
  })) {
    winOptions.x = x;
    winOptions.y = y;
  } else if (isLinux) {
    winOptions.center = true;
  }
  const win = new BrowserWindow(winOptions);
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
      let accentColor = '#20a6fc';
      try {
        if (process.platform === 'win32' || (systemPreferences && typeof systemPreferences.getAccentColor === 'function')) {
          const color = systemPreferences.getAccentColor();
          if (color) {
            accentColor = `#${color.substring(0, 6)}`;
          }
        }
      } catch (err) {
        logger.warn('获取系统强调色失败，回退至默认颜色', err);
      }
      const themeAndColor = {
        dark: nativeTheme.shouldUseDarkColors,
        color: accentColor,
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
    if (minimizeToTrayOnClose && appManager.getTray() && !appManager.state.isQuitting) {
      event.preventDefault();
      appManager.getWin().hide();
    }

    if (!maximize) {
      const size = appManager.getWin().getSize();
      [width, height] = size;
      if (!isLinux) {
        const pos = appManager.getWin().getPosition();
        [x, y] = pos;
      }
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
