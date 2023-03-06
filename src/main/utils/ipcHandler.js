import {
  app,
  dialog,
  Menu,
  Notification,
  shell,
  clipboard,
  nativeTheme,
} from 'electron';
import pkg from '@pkg/../package.json';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import createWindow from '@pkg/main/utils/createWindow';
import { join } from 'path';

const ipcHandler = (ipc) => ({
  [ipcType.DEVTOOLS](win = 'app') {
    const targetWin = win === 'app' ? global.win : global.childWins[win];
    if (targetWin) {
      targetWin.webContents.openDevTools();
    }
  },
  [ipcType.APP_MAXIMIZE](win = 'app') {
    const targetWin = win === 'app' ? global.win : global.childWins[win];
    if (targetWin) {
      if (targetWin.isMaximized()) {
        targetWin.unmaximize();
      } else {
        targetWin.maximize();
      }
    }
  },
  [ipcType.APP_UNMAXIMIZE](win = 'app') {
    const targetWin = win === 'app' ? global.win : global.childWins[win];
    if (targetWin) {
      targetWin.unmaximize();
    }
  },
  [ipcType.APP_MINIMIZE](win = 'app') {
    const targetWin = win === 'app' ? global.win : global.childWins[win];
    if (targetWin) {
      targetWin.minimize();
    }
  },
  [ipcType.APP_CLOSE](win = 'app') {
    const targetWin = win === 'app' ? global.win : global.childWins[win];
    if (targetWin) {
      targetWin.webContents.closeDevTools();
      targetWin.close();
    }
  },
  [ipcType.APP_IS_MAXIMIZE](win = 'app') {
    const targetWin = win === 'app' ? global.win : global.childWins[win];
    if (targetWin) {
      return Promise.resolve(targetWin.isMaximized());
    }
    return Promise.reject(new Error('targetWin is null'));
  },
  [ipcType.APP_VERSIONS](ipcId) {
    const versions = {
      app: pkg.version,
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
  [ipcType.OPEN_NEW_WINDOW]({ name, options = {} }) {
    if (global.childWins[name]) {
      if (global.childWins[name].isMinimized()) {
        global.childWins[name].restore();
      }
      global.childWins[name].focus();
    } else {
      const minWidth = options.minWidth || 700;
      const mainWinBound = global.win.getBounds();
      const winBound = global.store.get(`plugin.${name.replace('plugin-window-', '')}.window`, {
        x: mainWinBound.x + 10,
        y: mainWinBound.y + 10,
        width: options.width ? options.width : minWidth,
        height: options.height ? options.height : mainWinBound.height,
      });
      const indexPage = options.windowUrl || 'child-window.html';
      global.childWins[name] = createWindow(indexPage, {
        x: winBound.x,
        y: winBound.y,
        width: winBound.width,
        height: winBound.height,
        minWidth,
        useContentSize: typeof options.useContentSize !== 'undefined' ? options.useContentSize : false,
        frame: typeof options.frame !== 'undefined' ? options.frame : false,
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

      global.childWins[name].on('maximize', () => {
        ipc.sendToClient(`set-maximize-status:${name}`, true, global.childWins[name].webContents);
      });

      global.childWins[name].on('unmaximize', () => {
        ipc.sendToClient(`set-maximize-status:${name}`, false, global.childWins[name].webContents);
      });

      global.childWins[name].on('close', () => {
        const isPluginWindow = global.store.has(`plugin.${name.replace('plugin-window-', '')}`);
        if (isPluginWindow && !global.childWins[name].isMaximized()) {
          const pos = global.childWins[name].getPosition();
          const size = global.childWins[name].getSize();
          const [x, y, width, height] = [...pos, ...size];
          const windowProps = {
            x,
            y,
            width,
            height,
          };
          global.store.set(`plugin.${name.replace('plugin-window-', '')}.window`, windowProps);
        }
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
  [ipcType.GET_PLUGINS](packageName) {
    return new Promise(async (resolve, reject) => {
      if (global.plugin) {
        const plugins = packageName ? await global.plugin.getPlugin(packageName) : await global.plugin.getPlugins();
        resolve(JSON.parse(JSON.stringify(plugins)));
      } else {
        reject(new Error('插件未初始化'));
      }
    });
  },
  [ipcType.INSTALL_PLUGIN](packageString) {
    return new Promise(async (resolve, reject) => {
      if (global.plugin) {
        try {
          const [packageName, version] = packageString.split('@');
          const result = await global.plugin.installPlugin(packageName, version);
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
      if (global.plugin) {
        try {
          const result = await global.plugin.uninstallPlugin(packageName);
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
      if (global.plugin) {
        try {
          global.plugin.disablePlugin(packageName);
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
      if (global.plugin) {
        try {
          await global.plugin.enablePlugin(packageName);
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
      const settings = global.store.get(`plugin.${packageName}.settings`, {});
      resolve(settings);
    });
  },
  [ipcType.SET_PLUGIN_SETTING](packageName, key, settings = null) {
    return new Promise(async (resolve) => {
      if (typeof key === 'object' && !settings) {
        global.store.set(`plugin.${packageName}.settings`, key);
      } else {
        global.store.set(`plugin.${packageName}.settings.${key}`, settings);
      }
      resolve(true);
    });
  },
  [ipcType.OPEN_PLUGIN_CONTEXT_MENU](packageName) {
    if (global.plugin) {
      global.plugin.popPluginMenu(packageName, ipc);
    }
  },
  [ipcType.DIALOG_SHOW_OPEN_DIALOG](options) {
    return dialog.showOpenDialog(options);
  },
  [ipcType.DIALOG_SHOW_SAVE_DIALOG](options) {
    return dialog.showSaveDialog(options);
  },
  [ipcType.DIALOG_SHOW_MESSAGE_BOX](options) {
    return dialog.showMessageBox(options);
  },
  [ipcType.DIALOG_SHOW_ERROR_BOX](title, content) {
    return dialog.showErrorBox(title, content);
  },
  [ipcType.DIALOG_SHOW_CERTIFICATE_TRUST_DIALOG](options) {
    return dialog.showCertificateTrustDialog(options);
  },
  [ipcType.SHOW_NOTIFICATION](options, timeout = 0) {
    if (Notification.isSupported()) {
      const notification = new Notification(options);
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
    global.store.set('setting.openAtLogin', open);
  },
  [ipcType.SHOW_DEV_PLUGIN]({ isShow }) {
    global.store.set('setting.showDevPlugin', isShow);
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
