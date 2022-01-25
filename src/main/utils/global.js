import { app, ipcMain } from 'electron';
import path from 'path';
import appConfigStore from './appConfigStore';

global.ROOT = path.join(__dirname, '..');
global.APPDATA_PATH = app.getPath('userData');
global.launchWin = null;
global.win = null;
global.childWins = {};
global.ipc = null;
global.store = appConfigStore;
global.mainProcessLock = null;

ipcMain.handle('appConfigStore', (event, method, ...rest) => {
  if (!rest.length) {
    return appConfigStore[method];
  }
  return appConfigStore[method](...rest);
});
