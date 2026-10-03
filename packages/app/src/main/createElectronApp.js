import {
  app,
  ipcMain,
  protocol,
} from 'electron';
import EventEmitter from 'node:events';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import createMainWindow from './main';
import appManager from './utils/useAppManager';
import logger from './utils/logger';
import createLaunchWindow from './launch';
import createTray from './core/tray';
import pluginLoader from './core/pluginLoader';
import setupDeepLink, { linkHandler } from './core/deepLink';
import * as autoUpdate from './core/autoUpdate';
import { setupLinuxDesktopIntegration } from './utils/linuxDesktopIntegration';

/**
 * 插件状态变化推送给渲染端的防抖间隔（毫秒）。
 *
 * 启动阶段多个插件接连完成激活，逐个推送会让渲染端重复拉取插件列表。
 */
const PLUGINS_CHANGED_DEBOUNCE = 150;

class CreateElectronApp extends EventEmitter {
  constructor() {
    super();
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.pluginsChangedTimer = null;
  }

  init() {
    this.base();
    this.onPluginSettled();
    this.onAppReady();
    this.onAppQuit();

    app.on('before-quit', () => {
      appManager.state.isQuitting = true;
    });
  }

  // eslint-disable-next-line class-methods-use-this
  base() {
    app.name = 'translime';
    if (process.platform === 'linux') {
      setupLinuxDesktopIntegration();
      const ozoneHint = process.env.TRANSLIME_OZONE_PLATFORM
        || process.env.ELECTRON_OZONE_PLATFORM_HINT
        || 'auto';
      app.commandLine.appendSwitch('ozone-platform-hint', ozoneHint);
      app.commandLine.appendSwitch('enable-wayland-ime');
      if (typeof app.setDesktopName === 'function') {
        app.setDesktopName('translime.desktop');
      }
    }

    appManager.state.mainProcessLock = app.requestSingleInstanceLock();
    if (!appManager.state.mainProcessLock) {
      app.quit();
    } else {
      logger.info(`app 启动 | ${process.env.NODE_ENV || 'production'}`);
      app.on('second-instance', (ev, commandLine) => {
        // 当运行第二个实例时,将会聚焦到 win 这个窗口
        if (appManager.getWin()) {
          if (appManager.getWin().isMinimized()) {
            appManager.getWin().restore();
          }
          appManager.getWin().focus();
          if (typeof appManager.getWin().flashFrame === 'function') {
            appManager.getWin().flashFrame(true);
          }
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
      // 切换窗口前完成 onStartup 激活，确保主窗口展示时插件状态与字体均已就绪
      appManager.getPluginLoader()?.activateStartupPlugins();

      if (appManager.getLaunchWin()) {
        appManager.getLaunchWin().close();
        appManager.setLaunchWin(null);
      }
      appManager.getWin().show();

      // onAppReady 插件按约定在主窗口稳定后异步激活
      setTimeout(() => {
        appManager.getPluginLoader()?.triggerActivation('onAppReady');
      }, 0);

      autoUpdate.init();
      // 延迟一点检查更新，以免影响启动速度
      setTimeout(() => {
        autoUpdate.checkForUpdates();
      }, 15000);
    });
  }

  /**
   * 防抖推送插件状态变化（含隔离插件异步握手），通知渲染端刷新插件列表。
   *
   * @returns {void}
   */
  onPluginSettled() {
    const notifyPluginsChanged = () => {
      if (this.pluginsChangedTimer) {
        clearTimeout(this.pluginsChangedTimer);
      }
      this.pluginsChangedTimer = setTimeout(() => {
        this.pluginsChangedTimer = null;
        appManager.getIpc()?.sendToAllWindows(ipcType.PLUGINS_CHANGED);
      }, PLUGINS_CHANGED_DEBOUNCE);
    };
    pluginLoader.on('plugin:enabled', notifyPluginsChanged);
    pluginLoader.on('plugin:error', notifyPluginsChanged);
  }

  onAppReady() {
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (appManager.getWin() === null) {
        createMainWindow();
      }
    });

    app.whenReady()
      .then(async () => {
        if (this.isDevelopment) {
          try {
            const { installExtension, VUEJS_DEVTOOLS } = await import('electron-devtools-installer');
            await installExtension(VUEJS_DEVTOOLS, {
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
        // 与渲染进程首屏并行扫描插件目录与清单；
        // Ipc 实例在 createMainWindow 中创建，插件扫描与后续激活需在其之后执行
        appManager.setPluginLoader(pluginLoader);
        pluginLoader.scanPlugins();
        if (process.platform === 'win32') {
          app.setAppUserModelId(this.isDevelopment ? process.execPath : 'translime.app');
        } else if (process.platform === 'linux' && typeof app.setDesktopName === 'function') {
          app.setDesktopName('translime.desktop');
        }
      });
  }

  onAppQuit() {
    app.on('will-quit', () => {
      appManager.getPluginLoader()?.appClose();
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
