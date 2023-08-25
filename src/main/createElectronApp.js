import {
  app,
  ipcMain,
  protocol,
} from 'electron';
import EventEmitter from 'events';
import createMainWindow from './main';
import mainStore from './utils/useMainStore';
import logger from './utils/logger';
import createLaunchWindow from './launch';
import createTray from './core/tray';
import pluginLoader from './core/pluginLoader';
import setupDeepLink, { linkHandler } from './core/deepLink';

class CreateElectronApp extends EventEmitter {
  constructor() {
    super();
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.win = mainStore.getWin();
  }

  init() {
    logger.info(`app 启动 | ${process.env.NODE_ENV || 'production'}`);
    this.base();
    this.onAppReady();
    this.onAppQuit();
  }

  base() {
    mainStore.set('mainProcessLock', app.requestSingleInstanceLock());
    if (!mainStore.get('mainProcessLock')) {
      app.quit();
    } else {
      app.on('second-instance', (ev, commandLine) => {
        // 当运行第二个实例时,将会聚焦到 win 这个窗口
        if (this.win) {
          if (this.win.isMinimized()) {
            this.win.restore();
          }
          this.win.focus();
          linkHandler(commandLine.pop());
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

    ipcMain.on('main-renderer-ready', () => {
      setupDeepLink();
      if (mainStore.get('launchWin')) {
        mainStore.get('launchWin').close();
        mainStore.set('launchWin', null);
      }
      mainStore.getWin().show();

      // 开始加载插件
      mainStore.set('pluginLoader', pluginLoader);
      mainStore.get('pluginLoader').getPlugins();
    });
  }

  onAppReady() {
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainStore.getWin() === null) {
        createMainWindow();
      }
    });

    app.whenReady()
      .then(async () => {
        if (this.isDevelopment) {
          try {
            const { default: install, VUEJS_DEVTOOLS } = await import('electron-devtools-installer');
            await install.default(VUEJS_DEVTOOLS, {
              loadExtensionOptions: {
                allowFileAccess: true,
              },
            });
          } catch (err) {
            logger.error(`Vue Devtools failed to install: ${err.toString()}`);
          }
        }

        createTray();
        createLaunchWindow();
        createMainWindow();
        if (process.platform === 'win32') {
          app.setAppUserModelId(this.isDevelopment ? process.execPath : 'translime.app');
        }
      });
  }

  onAppQuit() {
    app.on('will-quit', () => {
      mainStore.get('pluginLoader').appClose();
      logger.info('app 关闭');
    });

    // Exit cleanly on request from parent process in development mode.
    if (this.isDevelopment) {
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

    // Quit when all windows are closed.
    app.on('window-all-closed', () => {
      // On macOS it is common for applications and their menu bar
      // to stay active until the user quits explicitly with Cmd + Q
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
  }
}

export default CreateElectronApp;
