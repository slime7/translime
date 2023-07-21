import {
  app,
  ipcMain,
  protocol,
} from 'electron';
import mainStore from '@pkg/main/utils/useMainStore';
import pluginLoader from '@pkg/share/lib/pluginLoader';
import createMainWindow from './main';
import createLaunchWindow from './launch';
import createTray from './tray';

const isDevelopment = process.env.NODE_ENV === 'development';
mainStore.set('mainProcessLock', app.requestSingleInstanceLock());
if (!mainStore.get('mainProcessLock')) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 当运行第二个实例时,将会聚焦到 win 这个窗口
    if (mainStore.getWin()) {
      if (mainStore.getWin().isMinimized()) {
        mainStore.getWin().restore();
      }
      mainStore.getWin().focus();
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
  if (mainStore.getWin() === null) {
    createMainWindow();
  }
});

app.on('will-quit', () => {
  mainStore.get('pluginLoader').appClose();
});

app.whenReady()
  .then(async () => {
    if (isDevelopment) {
      try {
        const { default: install, VUEJS_DEVTOOLS } = await import('electron-devtools-installer');
        await install.default(VUEJS_DEVTOOLS, {
          loadExtensionOptions: {
            allowFileAccess: true,
          },
        });
      } catch (err) {
        console.error('Vue Devtools failed to install:', err.toString());
      }
    }
    createLaunchWindow();
    createMainWindow();
    createTray();
    if (process.platform === 'win32') {
      app.setAppUserModelId(isDevelopment ? process.execPath : 'translime.app');
    }
  });

ipcMain.on('main-renderer-ready', () => {
  if (mainStore.get('launchWin')) {
    mainStore.get('launchWin').close();
    mainStore.set('launchWin', null);
  }
  mainStore.getWin().show();

  // 开始加载插件
  mainStore.set('pluginLoader', pluginLoader);
  mainStore.get('pluginLoader').getPlugins();
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
