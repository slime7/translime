import {
  app,
  clipboard,
  dialog,
  Menu,
  nativeTheme,
  Notification,
  shell,
  systemPreferences,
} from 'electron';
import fs from 'node:fs';
import { join, sep } from 'node:path';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import createWindow from '../utils/createWindow';
import mainStore from '../utils/useMainStore';
import appManager from '../utils/useAppManager';
import logger from '../utils/logger';
import { listLogDates, readLogRecords } from '../utils/logViewer';
import netHandler from './netHandler';
import autoUpdate from './autoUpdate';

const ipcHandler = {
  ...netHandler,
  ...autoUpdate,
  [ipcType.DEVTOOLS](win = 'app') {
    const targetWin = win === 'app' ? appManager.getWin() : appManager.getChildWin(win);
    if (targetWin) {
      if (targetWin.webContents.isDevToolsOpened()) {
        targetWin.webContents.closeDevTools();
      } else {
        targetWin.webContents.openDevTools();
      }
    }
  },
  [ipcType.APP_MAXIMIZE](win = 'app') {
    const targetWin = win === 'app' ? appManager.getWin() : appManager.getChildWin(win);
    if (targetWin) {
      if (targetWin.isMaximized()) {
        targetWin.unmaximize();
      } else {
        targetWin.maximize();
      }
    }
  },
  [ipcType.APP_UNMAXIMIZE](win = 'app') {
    const targetWin = win === 'app' ? appManager.getWin() : appManager.getChildWin(win);
    if (targetWin) {
      targetWin.unmaximize();
    }
  },
  [ipcType.APP_MINIMIZE](win = 'app') {
    const targetWin = win === 'app' ? appManager.getWin() : appManager.getChildWin(win);
    if (targetWin) {
      targetWin.minimize();
    }
  },
  [ipcType.APP_CLOSE](win = 'app') {
    const targetWin = win === 'app' ? appManager.getWin() : appManager.getChildWin(win);
    if (targetWin) {
      targetWin.webContents.closeDevTools();
      targetWin.close();
    }
  },
  [ipcType.APP_IS_MAXIMIZE](win = 'app') {
    const targetWin = win === 'app' ? appManager.getWin() : appManager.getChildWin(win);
    if (targetWin) {
      return targetWin.isMaximized();
    }
    throw new Error('targetWin is null');
  },
  [ipcType.APP_VERSIONS]() {
    return {
      app: mainStore.APP_VERSION,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      v8: process.versions.v8,
      node: process.versions.node,
    };
  },
  [ipcType.OPEN_LINK]({ url }) {
    shell.openExternal(url);
  },
  [ipcType.OPEN_DIR]({ dirPath }) {
    const sysDirPath = dirPath.replaceAll('/', sep);
    shell.openPath(sysDirPath)
      .catch((err) => {
        logger.error('', err);
      });
  },
  [ipcType.OPEN_APP_PATH]() {
    shell.openPath(mainStore.APPDATA_PATH)
      .catch((err) => {
        logger.error('', err);
      });
  },
  [ipcType.RELOAD]() {
    appManager.getWin().reload();
  },
  [ipcType.RELAUNCH]() {
    app.relaunch({
      args: process.argv.slice(1).concat(['--relaunch']),
    });
    app.quit();
  },
  async [ipcType.SHOW_OPEN_DIALOG]({ electronOptions } = {}) {
    return dialog.showOpenDialog(...electronOptions);
  },
  [ipcType.OPEN_NEW_WINDOW]({ name, options = {} }) {
    if (appManager.getChildWin(name)) {
      if (appManager.getChildWin(name).isMinimized()) {
        appManager.getChildWin(name).restore();
      }
      appManager.getChildWin(name).focus();
    } else {
      const minWidth = options.minWidth || 540;
      const mainWinBound = appManager.getWin().getBounds();
      const winBound = mainStore.config.get(`plugin.${name.replace('plugin-window-', '')}.window`, {
        x: mainWinBound.x + 10,
        y: mainWinBound.y + 10,
        width: options.width ? options.width : minWidth,
        height: options.height ? options.height : mainWinBound.height,
      });
      const indexPage = options.windowUrl || 'child-window.html';
      const win = createWindow(indexPage, {
        x: winBound.x,
        y: winBound.y,
        width: winBound.width,
        height: winBound.height,
        minWidth,
        useContentSize:
          typeof options.useContentSize !== 'undefined' ? options.useContentSize : false,
        frame: typeof options.frame !== 'undefined' ? options.frame : true,
        titleBarStyle: options.titleBarStyle || 'default',
        titleBarOverlay:
          typeof options.titleBarOverlay !== 'undefined' ? options.titleBarOverlay : false,
        title: options.title || 'translime',
        resizable: typeof options.resizable !== 'undefined' ? options.resizable : true,
        transparent:
          typeof options.transparent !== 'undefined' ? options.transparent : false,
        autoHideMenuBar:
          typeof options.autoHideMenuBar !== 'undefined' ? options.autoHideMenuBar : false,
        opacity: typeof options.opacity !== 'undefined' ? options.opacity : 1,
        skipTaskbar: typeof options.skipTaskbar !== 'undefined' ? options.skipTaskbar : false,
        focusable: typeof options.focusable !== 'undefined' ? options.focusable : true,
        webPreferences: {
          preload: join(app.getAppPath(), 'dist/preload/index.cjs'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          webviewTag: true,
        },
      }, null);
      appManager.setChildWin(name, win);

      appManager.getChildWin(name).on('maximize', () => {
        appManager.getIpc().sendToClient(
          `set-maximize-status:${name}`,
          true,
          appManager.getChildWin(name).webContents,
        );
      });

      appManager.getChildWin(name).on('unmaximize', () => {
        appManager.getIpc().sendToClient(
          `set-maximize-status:${name}`,
          false,
          appManager.getChildWin(name).webContents,
        );
      });

      appManager.getChildWin(name).on('close', () => {
        const isPluginWindow = mainStore.config.has(`plugin.${name.replace('plugin-window-', '')}`);
        if (isPluginWindow && !appManager.getChildWin(name).isMaximized()) {
          const pos = appManager.getChildWin(name).getPosition();
          const size = appManager.getChildWin(name).getSize();
          const [x, y, width, height] = [...pos, ...size];
          const windowProps = {
            x,
            y,
            width,
            height,
          };
          mainStore.config.set(`plugin.${name.replace('plugin-window-', '')}.window`, windowProps);
        }
      });

      appManager.getChildWin(name).on('closed', () => {
        appManager.removeChildWin(name);
      });
    }
  },
  async [ipcType.GET_PATH](name) {
    return app.getPath(name);
  },
  async [ipcType.GET_PLUGINS](packageName) {
    const loader = appManager.getPluginLoader();
    if (loader) {
      const plugins = packageName ? await loader.getPlugin(packageName) : await loader.getPlugins();
      return JSON.parse(JSON.stringify(plugins));
    }
    throw new Error('插件未初始化');
  },
  async [ipcType.INSTALL_PLUGIN](packageString) {
    const loader = appManager.getPluginLoader();
    if (loader) {
      try {
        const [packageName, version] = packageString.split('@');
        const result = await loader.installPlugin(packageName, version);
        return result;
      } catch (err) {
        throw new Error(`插件安装出错: ${err.message}`);
      }
    }
    throw new Error('插件未初始化');
  },
  async [ipcType.INSTALL_LOCAL_PLUGIN](packagePath) {
    const loader = appManager.getPluginLoader();
    if (loader) {
      try {
        const result = await loader.installLocalPlugin(packagePath);
        return result;
      } catch (err) {
        throw new Error(`插件安装出错: ${err.message}`);
      }
    }
    throw new Error('插件未初始化');
  },
  async [ipcType.UNINSTALL_PLUGIN](packageName) {
    const loader = appManager.getPluginLoader();
    if (loader) {
      try {
        const result = await loader.uninstallPlugin(packageName);
        return result;
      } catch (err) {
        throw new Error(`插件卸载出错: ${err.message}`);
      }
    }
    throw new Error('插件未初始化');
  },
  async [ipcType.DISABLE_PLUGIN](packageName) {
    const loader = appManager.getPluginLoader();
    if (loader) {
      try {
        loader.disablePlugin(packageName);
        return true;
      } catch (err) {
        throw new Error(`插件停用出错: ${err.message}`);
      }
    }
    throw new Error('插件未初始化');
  },
  async [ipcType.ENABLE_PLUGIN](packageName) {
    const loader = appManager.getPluginLoader();
    if (loader) {
      try {
        await loader.enablePlugin(packageName);
        return true;
      } catch (err) {
        throw new Error(`插件启用出错: ${err.message}`);
      }
    }
    throw new Error('插件未初始化');
  },
  async [ipcType.ACTIVATE_PLUGIN](packageName, reason = 'manual') {
    const loader = appManager.getPluginLoader();
    if (loader) {
      try {
        if (reason === 'view') {
          loader.triggerViewActivation(packageName);
        } else {
          loader.enablePlugin(packageName);
        }
        return true;
      } catch (err) {
        throw new Error(`插件激活出错: ${err.message}`);
      }
    }
    throw new Error('插件未初始化');
  },
  async [ipcType.EXECUTE_PLUGIN_COMMAND](commandId, ...args) {
    const loader = appManager.getPluginLoader();
    if (loader) {
      try {
        return await loader.executeCommand(commandId, ...args);
      } catch (err) {
        throw new Error(`插件命令执行出错: ${err.message}`);
      }
    }
    throw new Error('插件未初始化');
  },
  async [ipcType.REFRESH_DEV_PLUGINS]() {
    const loader = appManager.getPluginLoader();
    if (loader) {
      try {
        loader.refreshDevPlugins();
        return true;
      } catch (err) {
        throw new Error(`开发插件刷新失败: ${err.message}`);
      }
    }
    throw new Error('插件未初始化');
  },
  async [ipcType.GET_PLUGIN_SETTING](packageName) {
    const settings = mainStore.config.get(`plugin.${packageName}.settings`, {});
    return settings;
  },
  async [ipcType.SET_PLUGIN_SETTING](packageName, key, settings = null) {
    if (typeof key === 'object' && !settings) {
      mainStore.config.set(`plugin.${packageName}.settings`, key);
    } else {
      mainStore.config.set(`plugin.${packageName}.settings.${key}`, settings);
    }
    const pluginLoader = appManager.getPluginLoader();
    if (pluginLoader) {
      pluginLoader.onPluginSettingSave(packageName);
    }
    return true;
  },
  [ipcType.OPEN_PLUGIN_CONTEXT_MENU](packageName) {
    const loader = appManager.getPluginLoader();
    if (loader) {
      loader.popPluginMenu(packageName, appManager.getIpc());
    }
  },
  [ipcType.DIALOG_SHOW_OPEN_DIALOG](winOrOptions, options) {
    if (winOrOptions && typeof winOrOptions === 'string') {
      return dialog.showOpenDialog(
        appManager.getChildWin(winOrOptions) || appManager.getWin(),
        options,
      );
    }
    return dialog.showOpenDialog(winOrOptions);
  },
  [ipcType.DIALOG_SHOW_SAVE_DIALOG](winOrOptions, options) {
    if (winOrOptions && typeof winOrOptions === 'string') {
      return dialog.showSaveDialog(
        appManager.getChildWin(winOrOptions) || appManager.getWin(),
        options,
      );
    }
    return dialog.showSaveDialog(winOrOptions);
  },
  [ipcType.DIALOG_SHOW_MESSAGE_BOX](winOrOptions, options) {
    if (winOrOptions && typeof winOrOptions === 'string') {
      return dialog.showMessageBox(
        appManager.getChildWin(winOrOptions) || appManager.getWin(),
        options,
      );
    }
    return dialog.showMessageBox(winOrOptions);
  },
  [ipcType.DIALOG_SHOW_ERROR_BOX](title, content) {
    return dialog.showErrorBox(title, content);
  },
  [ipcType.DIALOG_SHOW_CERTIFICATE_TRUST_DIALOG](winOrOptions, options) {
    if (winOrOptions && typeof winOrOptions === 'string') {
      return dialog.showCertificateTrustDialog(
        appManager.getChildWin(winOrOptions) || appManager.getWin(),
        options,
      );
    }
    return dialog.showCertificateTrustDialog(winOrOptions);
  },
  [ipcType.SHOW_NOTIFICATION](options, timeout = 0) {
    if (Notification.isSupported()) {
      const notification = new Notification(options);
      notification.on('click', () => {
        notification.close();
      });
      notification.show();
      if (timeout > 0) {
        setTimeout(() => {
          notification.close();
        }, timeout);
      }
      return Promise.resolve();
    }
    return Promise.reject(new Error('通知调用失败'));
  },
  [ipcType.IS_NOTIFICATION_SUPPORTED]() {
    return Notification.isSupported();
  },
  [ipcType.OPEN_AT_LOGIN]({ open }) {
    app.setLoginItemSettings({
      openAtLogin: open,
      openAsHidden: false,
      name: 'translime.app',
    });
    mainStore.config.set('setting.openAtLogin', open);
  },
  [ipcType.SHOW_DEV_PLUGIN]({ isShow }) {
    mainStore.config.set('setting.showDevPlugin', isShow);
  },
  [ipcType.SHOW_TEXT_EDIT_CONTEXT]({ selectedText = '' }) {
    const clipboardText = clipboard.readText();
    const contextMenuItems = [
      {
        role: 'undo',
        label: '撤销',
        registerAccelerator: false,
        accelerator: 'CommandOrControl+Z',
      },
      {
        role: 'redo',
        label: '重做',
        registerAccelerator: false,
        accelerator: 'CommandOrControl+Y',
      },
      { type: 'separator' },
      {
        role: 'cut',
        label: '剪切',
        registerAccelerator: false,
        accelerator: 'CommandOrControl+X',
        enabled: selectedText,
      },
      {
        role: 'copy',
        label: '复制',
        registerAccelerator: false,
        accelerator: 'CommandOrControl+C',
        enabled: selectedText,
      },
      {
        role: 'paste',
        label: '粘贴',
        registerAccelerator: false,
        accelerator: 'CommandOrControl+V',
        enabled: clipboardText,
      },
    ];
    const menu = Menu.buildFromTemplate(contextMenuItems);
    menu.popup();
  },
  [ipcType.GET_NATIVE_THEME]() {
    return {
      shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
    };
  },
  [ipcType.SET_NATIVE_THEME]({ theme }) {
    nativeTheme.themeSource = theme;
  },
  [ipcType.THEME_COLOR_UPDATED]() {
    appManager.getIpc().sendToAllWindows(ipcType.THEME_COLOR_UPDATED);
  },
  [ipcType.GET_LAUNCH_ARGV]() {
    return process.argv;
  },
  async [ipcType.GET_LOG_DATES]() {
    return listLogDates(mainStore.APPDATA_PATH);
  },
  async [ipcType.GET_LOG_RECORDS](date) {
    return readLogRecords(mainStore.APPDATA_PATH, date);
  },
  [ipcType.COPY_TEXT](text = '') {
    clipboard.writeText(String(text));
    return true;
  },
  [ipcType.READ_CLIPBOARD_TEXT]() {
    return clipboard.readText();
  },
  [ipcType.LOGGER](level, payload) {
    if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.args) {
      const { args, meta } = payload;

      if (meta && Object.keys(meta).length > 0) {
        // 如果有额外的 metadata (来自 child logger)
        // 合并策略：如果最后一个参数是对象，则合并；否则作为一个新参数追加
        const lastArg = args[args.length - 1];
        if (lastArg && typeof lastArg === 'object' && !Array.isArray(lastArg)) {
          const combinedMeta = { ...meta, ...lastArg };
          logger[level](...args.slice(0, -1), combinedMeta);
        } else {
          logger[level](...args, meta);
        }
      } else {
        logger[level](...args);
      }
    } else {
      // 兼容旧版调用
      const args = Array.isArray(payload) ? payload : [payload];
      logger[level](...args);
    }
  },
  async [ipcType.LOAD_PLUGIN_UI](pluginPath) {
    return fs.readFileSync(pluginPath, 'utf8');
  },
  [ipcType.GET_SYSTEM_COLOR]() {
    try {
      const color = systemPreferences.getAccentColor();
      // 如果是 Windows，返回的是 RRGGBBAA 格式，需要处理
      if (process.platform === 'win32') {
        return `#${color.substring(0, 6)}`;
      }
      return `#${color}`;
    } catch (e) {
      logger.error('Failed to get system accent color', e);
      return null;
    }
  },
  [ipcType.GET_PRELOAD_PATH]() {
    return `file://${join(app.getAppPath(), 'dist/preload/index.cjs').replace(/\\/g, '/')}`;
  },
  ping() {
    logger.debug('pong', new Date());
  },
  ping2(foo, bar) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(`${foo} ${bar} from ping2 @ ${new Date()}`);
      }, 2000);
    });
  },
};

export default ipcHandler;
