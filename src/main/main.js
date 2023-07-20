import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  screen,
} from 'electron';
import Store from 'electron-store';
import { join } from 'path';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import createProtocol from './utils/createProtocol';
import mainStore from './utils/useMainStore';
import Ipc from './Ipc';

export default async () => {
  app.applicationMenu = null;
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
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true,
    },
  });
  mainStore.set('win', win);
  Store.initRenderer();
  const ipc = new Ipc(ipcMain, mainStore.getWin().webContents);
  mainStore.set('ipc', ipc);

  mainStore.getWin().on('maximize', () => {
    maximize = true;
    ipc.sendToClient('set-maximize-status', true);
  });

  mainStore.getWin().on('unmaximize', () => {
    maximize = false;
    ipc.sendToClient('set-maximize-status', false);
  });

  ipcMain.handle('appConfigStore', (event, method, ...rest) => {
    const data = mainStore.config[method](...rest);
    return Promise.resolve({ data, err: null });
  });

  nativeTheme.on('updated', () => {
    if (mainStore.ipc()) {
      mainStore.ipc().sendToClient(ipcType.THEME_UPDATED, { dark: nativeTheme.shouldUseDarkColors });
      Object.keys(mainStore.getChildWin()).forEach((windowKey) => {
        mainStore.ipc().sendToClient(ipcType.THEME_UPDATED, { dark: nativeTheme.shouldUseDarkColors }, mainStore.getChildWin(windowKey).webContents);
      });
    }
  });

  if (import.meta.env.VITE_DEV_SERVER_URL !== undefined && import.meta.env.VITE_DEV_SERVER_URL !== undefined) {
    if (!process.env.IS_TEST) mainStore.getWin().webContents.openDevTools({ mode: 'undocked' });
    // Load the url of the dev server if in development mode
    await mainStore.getWin().loadURL(import.meta.env.VITE_DEV_SERVER_URL);
  } else {
    createProtocol('app');
    // Load the index.html when not in development
    mainStore.getWin().loadURL('app://./index.html');
  }

  mainStore.getWin().on('close', () => {
    if (!maximize) {
      const pos = mainStore.getWin().getPosition();
      const size = mainStore.getWin().getSize();
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

  mainStore.getWin().on('closed', () => {
    mainStore.set('win', null);
    app.quit();
  });
};
