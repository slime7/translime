import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
} from 'electron';
import Store from 'electron-store';
import { join } from 'path';
import createProtocol from './utils/createProtocol';
import Ipc from './Ipc';

export default async () => {
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
  } = global.store.get('window', defaultWin);
  maximize = false;
  // Create the browser window.
  global.win = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: true,
    show: false,
    minWidth: 700,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true,
    },
  });
  Store.initRenderer();
  const ipc = new Ipc(ipcMain, global.win.webContents);
  global.ipc = ipc;

  global.win.on('maximize', () => {
    maximize = true;
    ipc.sendToClient('set-maximize-status', true);
  });

  global.win.on('unmaximize', () => {
    maximize = false;
    ipc.sendToClient('set-maximize-status', false);
  });

  if (import.meta.env.VITE_DEV_SERVER_URL !== undefined && import.meta.env.VITE_DEV_SERVER_URL !== undefined) {
    if (!process.env.IS_TEST) global.win.webContents.openDevTools({ mode: 'undocked' });
    // Load the url of the dev server if in development mode
    await global.win.loadURL(import.meta.env.VITE_DEV_SERVER_URL);
  } else {
    createProtocol('app');
    // Load the index.html when not in development
    global.win.loadURL('app://./index.html');
  }

  global.win.on('close', () => {
    if (!maximize) {
      const pos = global.win.getPosition();
      const size = global.win.getSize();
      [x, y, width, height] = [...pos, ...size];
    }
    global.store.set('window', {
      x,
      y,
      width,
      height,
      maximize,
    });
  });

  global.win.on('closed', () => {
    global.win = null;
    app.quit();
  });
};
