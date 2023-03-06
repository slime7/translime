import {
  app,
  ipcMain,
  protocol,
} from 'electron';
import '@pkg/main/utils/global';
import pluginLoader from '@pkg/share/lib/pluginLoader';
import createMainWindow from './main';
import createLaunchWindow from './launch';
import createTray from './tray';

const isDevelopment = process.env.NODE_ENV !== 'production';
global.mainProcessLock = app.requestSingleInstanceLock();
if (!global.mainProcessLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 当运行第二个实例时,将会聚焦到 global.win 这个窗口
    if (global.win) {
      if (global.win.isMinimized()) {
        global.win.restore();
      }
      global.win.focus();
    }
  });
}

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: {
    secure: true,
    standard: true,
  },
}]);

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
  if (global.win === null) {
    createMainWindow();
  }
});

app.on('will-quit', () => {
  global.plugin.appClose();
});

app.whenReady()
  .then(() => {
    createLaunchWindow();
    createMainWindow();
    createTray();
    if (process.platform === 'win32') {
      app.setAppUserModelId(isDevelopment ? 'translime-dev' : 'translime');
    }
  });

if (isDevelopment) {
  app.whenReady()
    .then(() => import('electron-devtools-installer'))
    .then(({
      default: installExtension,
      VUEJS_DEVTOOLS,
    }) => installExtension.default(VUEJS_DEVTOOLS, {
      loadExtensionOptions: {
        allowFileAccess: true,
      },
    }))
    .catch((e) => console.error('Vue Devtools failed to install:', e.toString()));
}

ipcMain.on('main-renderer-ready', () => {
  if (global.launchWin) {
    global.launchWin.close();
    global.launchWin = null;
  }
  global.win.show();

  // 开始加载插件
  global.plugin = pluginLoader;
  pluginLoader.getPlugins();
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
