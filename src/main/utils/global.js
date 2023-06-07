import { app, ipcMain, nativeTheme } from 'electron';
import path from 'path';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import appConfigStore from './appConfigStore';

global.ROOT = path.join(__dirname, '..');
global.APPDATA_PATH = app.getPath('userData');
global.TEMP_DIR = app.getPath('temp');
global.launchWin = null;
global.win = null;
global.childWins = {};
global.ipc = null;
global.store = appConfigStore;
global.mainProcessLock = null;
global.tray = null;

ipcMain.handle('appConfigStore', (event, method, ...rest) => {
  const data = appConfigStore[method](...rest);
  return Promise.resolve({ data, err: null });
});

nativeTheme.on('updated', () => {
  if (global.ipc) {
    global.ipc.sendToClient(ipcType.THEME_UPDATED, { dark: nativeTheme.shouldUseDarkColors });
    Object.keys(global.childWins).forEach((windowKey) => {
      global.ipc.sendToClient(ipcType.THEME_UPDATED, { dark: nativeTheme.shouldUseDarkColors }, global.childWins[windowKey].webContents);
    });
  }
});
