import {
  app,
  dialog,
  Menu,
  Notification,
  shell,
  clipboard,
  nativeTheme,
} from 'electron';
import { join, sep } from 'path';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import createWindow from '@pkg/main/utils/createWindow';
import mainStore from '@pkg/main/utils/useMainStore';

const ipcHandler = (ipc) => ({
  [ipcType.DEVTOOLS](win = 'app') {
    const targetWin = win === 'app' ? mainStore.getWin() : mainStore.getChildWin(win);
    if (targetWin) {
      if (targetWin.webContents.isDevToolsOpened()) {
        targetWin.webContents.closeDevTools();
      } else {
        targetWin.webContents.openDevTools();
      }
    }
  },
  [ipcType.APP_MAXIMIZE](win = 'app') {
    const targetWin = win === 'app' ? mainStore.getWin() : mainStore.getChildWin(win);
    if (targetWin) {
      if (targetWin.isMaximized()) {
        targetWin.unmaximize();
      } else {
        targetWin.maximize();
      }
    }
  },
  [ipcType.APP_UNMAXIMIZE](win = 'app') {
    const targetWin = win === 'app' ? mainStore.getWin() : mainStore.getChildWin(win);
    if (targetWin) {
      targetWin.unmaximize();
    }
  },
  [ipcType.APP_MINIMIZE](win = 'app') {
    const targetWin = win === 'app' ? mainStore.getWin() : mainStore.getChildWin(win);
    if (targetWin) {
      targetWin.minimize();
    }
  },
  [ipcType.APP_CLOSE](win = 'app') {
    const targetWin = win === 'app' ? mainStore.getWin() : mainStore.getChildWin(win);
    if (targetWin) {
      targetWin.webContents.closeDevTools();
      targetWin.close();
    }
  },
  [ipcType.APP_IS_MAXIMIZE](win = 'app') {
    const targetWin = win === 'app' ? mainStore.getWin() : mainStore.getChildWin(win);
    if (targetWin) {
      return Promise.resolve(targetWin.isMaximized());
    }
    return Promise.reject(new Error('targetWin is null'));
  },
  [ipcType.APP_VERSIONS](ipcId) {
    const versions = {
      app: mainStore.APP_VERSION,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      v8: process.versions.v8,
      node: process.versions.node,
    };
    ipc.sendToClient(ipcId || ipcType.APP_VERSIONS, versions);
  },
  [ipcType.OPEN_LINK]({ url }) {
    shell.openExternal(url);
  },
  [ipcType.OPEN_DIR]({ dirPath }) {
    const sysDirPath = dirPath.replaceAll('/', sep);
    shell.openPath(sysDirPath)
      .catch((err) => {
        console.error(err);
      });
  },
  [ipcType.OPEN_APP_PATH]() {
    shell.openPath(mainStore.APPDATA_PATH)
      .catch((err) => {
        console.error(err);
      });
  },
  [ipcType.RELOAD]() {
    mainStore.getWin().reload();
  },
  [ipcType.RELAUNCH]() {
    app.relaunch({
      args: ['--relaunch'],
    });
    app.quit();
  },
  async [ipcType.SHOW_OPEN_DIALOG]({ electronOptions } = {}) {
    const result = await dialog.showSaveDialog(...electronOptions);
    ipc.sendToClient(ipcType.SHOW_OPEN_DIALOG, result);
  },
  [ipcType.OPEN_NEW_WINDOW]({ name, options = {} }) {
    if (mainStore.getChildWin(name)) {
      if (mainStore.getChildWin(name).isMinimized()) {
        mainStore.getChildWin(name).restore();
      }
      mainStore.getChildWin(name).focus();
    } else {
      const minWidth = options.minWidth || 540;
      const mainWinBound = mainStore.getWin().getBounds();
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
        useContentSize: typeof options.useContentSize !== 'undefined' ? options.useContentSize : false,
        frame: typeof options.frame !== 'undefined' ? options.frame : true,
        titleBarStyle: options.titleBarStyle || 'default',
        titleBarOverlay: typeof options.titleBarOverlay !== 'undefined' ? options.titleBarOverlay : false,
        title: options.title || 'translime',
        resizable: typeof options.resizable !== 'undefined' ? options.resizable : true,
        transparent: typeof options.transparent !== 'undefined' ? options.transparent : false,
        autoHideMenuBar: typeof options.autoHideMenuBar !== 'undefined' ? options.autoHideMenuBar : false,
        opacity: typeof options.opacity !== 'undefined' ? options.opacity : 1,
        skipTaskbar: typeof options.skipTaskbar !== 'undefined' ? options.skipTaskbar : false,
        focusable: typeof options.focusable !== 'undefined' ? options.focusable : true,
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
        },
      }, null);
      mainStore.setChildWin(name, win);

      mainStore.getChildWin(name).on('maximize', () => {
        ipc.sendToClient(`set-maximize-status:${name}`, true, mainStore.getChildWin(name).webContents);
      });

      mainStore.getChildWin(name).on('unmaximize', () => {
        ipc.sendToClient(`set-maximize-status:${name}`, false, mainStore.getChildWin(name).webContents);
      });

      mainStore.getChildWin(name).on('close', () => {
        const isPluginWindow = mainStore.config.has(`plugin.${name.replace('plugin-window-', '')}`);
        if (isPluginWindow && !mainStore.getChildWin(name).isMaximized()) {
          const pos = mainStore.getChildWin(name).getPosition();
          const size = mainStore.getChildWin(name).getSize();
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

      mainStore.getChildWin(name).on('closed', () => {
        mainStore.removeChildWin(name);
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
  [ipcType.GET_PLUGINS](packageName) {
    return new Promise(async (resolve, reject) => {
      if (mainStore.get('pluginLoader')) {
        const plugins = packageName ? await mainStore.get('pluginLoader').getPlugin(packageName) : await mainStore.get('pluginLoader').getPlugins();
        resolve(JSON.parse(JSON.stringify(plugins)));
      } else {
        reject(new Error('插件未初始化'));
      }
    });
  },
  [ipcType.INSTALL_PLUGIN](packageString) {
    return new Promise(async (resolve, reject) => {
      if (mainStore.get('pluginLoader')) {
        try {
          const [packageName, version] = packageString.split('@');
          const result = await mainStore.get('pluginLoader').installPlugin(packageName, version);
          resolve(result);
        } catch (err) {
          reject(new Error(`插件安装出错: ${err.message}`));
        }
      } else {
        reject(new Error('插件未初始化'));
      }
    });
  },
  [ipcType.INSTALL_LOCAL_PLUGIN](packagePath) {
    return new Promise(async (resolve, reject) => {
      if (mainStore.get('pluginLoader')) {
        try {
          const result = await mainStore.get('pluginLoader').installLocalPlugin(packagePath);
          resolve(result);
        } catch (err) {
          reject(new Error(`插件安装出错: ${err.message}`));
        }
      } else {
        reject(new Error('插件未初始化'));
      }
    });
  },
  [ipcType.UNINSTALL_PLUGIN](packageName) {
    return new Promise(async (resolve, reject) => {
      if (mainStore.get('pluginLoader')) {
        try {
          const result = await mainStore.get('pluginLoader').uninstallPlugin(packageName);
          resolve(result);
        } catch (err) {
          reject(new Error(`插件卸载出错: ${err.message}`));
        }
      } else {
        reject(new Error('插件未初始化'));
      }
    });
  },
  [ipcType.DISABLE_PLUGIN](packageName) {
    return new Promise((resolve, reject) => {
      if (mainStore.get('pluginLoader')) {
        try {
          mainStore.get('pluginLoader').disablePlugin(packageName);
          resolve(true);
        } catch (err) {
          reject(new Error(`插件停用出错: ${err.message}`));
        }
      } else {
        reject(new Error('插件未初始化'));
      }
    });
  },
  [ipcType.ENABLE_PLUGIN](packageName) {
    return new Promise(async (resolve, reject) => {
      if (mainStore.get('pluginLoader')) {
        try {
          await mainStore.get('pluginLoader').enablePlugin(packageName);
          resolve(true);
        } catch (err) {
          reject(new Error(`插件启用出错: ${err.message}`));
        }
      } else {
        reject(new Error('插件未初始化'));
      }
    });
  },
  [ipcType.GET_PLUGIN_SETTING](packageName) {
    return new Promise(async (resolve) => {
      const settings = mainStore.config.get(`plugin.${packageName}.settings`, {});
      resolve(settings);
    });
  },
  [ipcType.SET_PLUGIN_SETTING](packageName, key, settings = null) {
    return new Promise(async (resolve) => {
      if (typeof key === 'object' && !settings) {
        mainStore.config.set(`plugin.${packageName}.settings`, key);
      } else {
        mainStore.config.set(`plugin.${packageName}.settings.${key}`, settings);
      }
      mainStore.get('pluginLoader')?.onPluginSettingSave(packageName);
      resolve(true);
    });
  },
  [ipcType.OPEN_PLUGIN_CONTEXT_MENU](packageName) {
    if (mainStore.get('pluginLoader')) {
      mainStore.get('pluginLoader').popPluginMenu(packageName, ipc);
    }
  },
  [ipcType.DIALOG_SHOW_OPEN_DIALOG](winOrOptions, options) {
    if (winOrOptions && typeof winOrOptions === 'string') {
      return dialog.showOpenDialog(mainStore.getChildWin(winOrOptions) ? mainStore.get('childWins')[winOrOptions] : mainStore.getWin(), options);
    }
    return dialog.showOpenDialog(winOrOptions);
  },
  [ipcType.DIALOG_SHOW_SAVE_DIALOG](winOrOptions, options) {
    if (winOrOptions && typeof winOrOptions === 'string') {
      return dialog.showOpenDialog(mainStore.getChildWin(winOrOptions) ? mainStore.get('childWins')[winOrOptions] : mainStore.getWin(), options);
    }
    return dialog.showSaveDialog(winOrOptions);
  },
  [ipcType.DIALOG_SHOW_MESSAGE_BOX](winOrOptions, options) {
    if (winOrOptions && typeof winOrOptions === 'string') {
      return dialog.showOpenDialog(mainStore.getChildWin(winOrOptions) ? mainStore.get('childWins')[winOrOptions] : mainStore.getWin(), options);
    }
    return dialog.showMessageBox(winOrOptions);
  },
  [ipcType.DIALOG_SHOW_ERROR_BOX](title, content) {
    return dialog.showErrorBox(title, content);
  },
  [ipcType.DIALOG_SHOW_CERTIFICATE_TRUST_DIALOG](winOrOptions, options) {
    if (winOrOptions && typeof winOrOptions === 'string') {
      return dialog.showOpenDialog(mainStore.getChildWin(winOrOptions) ? mainStore.get('childWins')[winOrOptions] : mainStore.getWin(), options);
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
    const isSupported = Notification.isSupported();
    return Promise.resolve(isSupported);
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
    return Promise.resolve({
      shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
    });
  },
  [ipcType.SET_NATIVE_THEME]({ theme }) {
    nativeTheme.themeSource = theme;
  },
  [ipcType.GET_LAUNCH_ARGV]() {
    ipc.sendToClient(ipcType.GET_LAUNCH_ARGV, process.argv);
  },
  ping() {
    console.log('pong', new Date());
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
