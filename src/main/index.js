import { app, BrowserWindow, protocol } from 'electron';
import { join } from 'path';
import createProtocol from '@pkg/main/createProtocol';

const isDevelopment = import.meta.env.DEV;
const isSingleInstance = app.requestSingleInstanceLock();

if (!isSingleInstance) {
  app.quit();
  process.exit(0);
}

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: {
    secure: true,
    standard: true,
  },
}]);

let win;
const createMainWindow = () => {
  win = new BrowserWindow({
    show: false, // Use 'ready-to-show' event to show window
    width: 800,
    height: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  /**
   * URL for main window.
   * Vite dev server for development.
   * `file://../renderer/index.html` for production and test
   */
  if (isDevelopment && import.meta.env.VITE_DEV_SERVER_URL !== undefined) {
    win.loadURL(import.meta.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'undocked' });
  } else {
    createProtocol('app');
    // win.loadURL(new URL('../renderer/index.html', `file://${__dirname}`).toString());
    win.loadURL('app://./index.html');
  }

  /**
   * If you install `show: true` then it can cause issues when trying to close the window.
   * Use `show: false` and listener events `ready-to-show` to fix these issues.
   *
   * @see https://github.com/electron/electron/issues/25012
   */
  win.on('ready-to-show', () => {
    win?.show();
  });

  win.on('closed', () => {
    win = null;
  });
};

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createMainWindow();
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady()
  .then(() => {
    createMainWindow();
  });
if (isDevelopment) {
  app.whenReady()
    .then(() => import('electron-devtools-installer'))
    .then(({
      default: installExtension,
      VUEJS_DEVTOOLS,
    }) => installExtension(VUEJS_DEVTOOLS, {
      loadExtensionOptions: {
        allowFileAccess: true,
      },
    }))
    .catch((e) => console.error('Vue Devtools failed to install:', e.toString()));
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) {
      win.restore();
    }
    win.focus();
  }
});

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit();
      }
    });
  } else {
    process.on('SIGTERM', () => {
      app.quit();
    });
  }
}
