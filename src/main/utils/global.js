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
global.console = {
  log: (...args) => global.ipc.sendToClient('console', { type: 'log', args }),
  info: (...args) => global.ipc.sendToClient('console', { type: 'info', args }),
  error: (...args) => global.ipc.sendToClient('console', { type: 'error', args }),
  debug: (...args) => global.ipc.sendToClient('console', { type: 'debug', args }),
  dir: (...args) => global.ipc.sendToClient('console', { type: 'dir', args }),
  group: (...args) => global.ipc.sendToClient('console', { type: 'group', args }),
  groupCollapsed: (...args) => global.ipc.sendToClient('console', { type: 'groupCollapsed', args }),
  groupEnd: (...args) => global.ipc.sendToClient('console', { type: 'groupEnd', args }),
  table: (...args) => global.ipc.sendToClient('console', { type: 'table', args }),
  warn: (...args) => global.ipc.sendToClient('console', { type: 'warn', args }),
  trace: (...args) => global.ipc.sendToClient('console', { type: 'trace', args }),
};
global.mainProcessLock = null;

ipcMain.handle('appConfigStore', (event, method, ...rest) => {
  if (!rest.length) {
    return appConfigStore[method];
  }
  return appConfigStore[method](...rest);
});
