import { app, dialog, shell } from 'electron';
import pkg from '@pkg/../package.json';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import createWindow from '@pkg/main/utils/createWindow';
import { join } from 'path';

const ipcHandler = (ipc) => ({
  [ipcType.DEVTOOLS]() {
    if (global.win) {
      global.win.webContents.openDevTools();
    }
  },
  [ipcType.APP_MAXIMIZE]() {
    if (global.win) {
      global.win.maximize();
    }
  },
  [ipcType.APP_UNMAXIMIZE]() {
    if (global.win) {
      global.win.unmaximize();
    }
  },
  [ipcType.APP_MINIMIZE]() {
    if (global.win) {
      global.win.minimize();
    }
  },
  [ipcType.APP_CLOSE]() {
    if (global.win) {
      global.win.webContents.closeDevTools();
      global.win.close();
    }
  },
  [ipcType.APP_VERSIONS]() {
    const versions = {
      app: pkg.version,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      v8: process.versions.v8,
      node: process.versions.node,
    };
    ipc.sendToClient(ipcType.APP_VERSIONS, versions);
  },
  [ipcType.OPEN_LINK]({ url }) {
    shell.openExternal(url);
  },
  [ipcType.OPEN_DIR](ev, { dirPath }) {
    shell.openPath(dirPath)
      .catch((err) => {
        global.console.error(err);
      });
  },
  [ipcType.OPEN_APP_PATH]() {
    shell.openPath(global.APPDATA_PATH)
      .catch((err) => {
        global.console.error(err);
      });
  },
  [ipcType.RELOAD]() {
    global.win.reload();
  },
  async [ipcType.SHOW_OPEN_DIALOG]({ electronOptions } = {}) {
    const result = await dialog.showSaveDialog(...electronOptions);
    ipc.sendToClient(ipcType.SHOW_OPEN_DIALOG, result);
  },
  [ipcType.OPEN_NEW_WINDOW]({ name }) {
    if (global.childWins[name]) {
      if (global.childWins[name].isMinimized()) {
        global.childWins[name].restore();
      }
      global.childWins[name].focus();
    } else {
      const mainWinBound = global.win.getBounds();
      global.childWins[name] = createWindow('child-window.html', {
        x: mainWinBound.x + 10,
        y: mainWinBound.y + 10,
        width: mainWinBound.width,
        height: mainWinBound.height,
        webPreferences: {
          preload: join(__dirname, '../preload/index.cjs'),
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      global.childWins[name].on('closed', () => {
        delete global.childWins[name];
      });
    }
  },
  [ipcType.GET_PATH](name) {
    return new Promise((resolve, reject) => {
      try {
        const path = app.getPath(name);
        resolve(path);
      } catch (err) {
        reject(err);
      }
    });
  },
  ping() {
    global.console.log('pong', new Date());
  },
  ping2(foo, bar) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(`${foo} ${bar} from ping2 @ ${new Date()}`);
      }, 2000);
    });
  },
});

export default ipcHandler;
