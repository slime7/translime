import {
  app,
  clipboard,
  dialog,
  nativeImage,
  nativeTheme,
  Notification,
  shell,
  systemPreferences,
} from 'electron';
import fs from 'node:fs';
import {
  dirname, isAbsolute, join, resolve as pathResolve, relative, sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import icon from '@pkg/share/static/icon.png';
import createWindow from '../utils/createWindow';
import mainStore from '../utils/useMainStore';
import appManager from '../utils/useAppManager';
import logger from '../utils/logger';
import { listLogDates, readLogRecords } from '../utils/logViewer';
import {
  resolveOverlayMode,
  resolveTitleBarOverlay,
  TITLE_BAR_OVERLAY_COLOR,
} from '../utils/titleBarOverlay';
import { PLUGIN_MODULES_PATH, PLUGIN_MODULES_PATH_DEV } from './plugin-loader/constants';
import { attributeSender, resolveSenderPluginId } from './plugin-loader/pluginSenderRegistry';
import netHandler from './netHandler';
import autoUpdate from './autoUpdate';
import buildTextEditMenu from './textEditMenu';
import { dispatchMenuAction } from './menuRegistry';
import { getIpcSender } from './ipcContext';

const dir = dirname(fileURLToPath(import.meta.url));

const PLUGIN_LOADER_NOT_READY_ERROR = '\u63d2\u4ef6\u672a\u521d\u59cb\u5316';

const getPluginLoaderOrThrow = () => {
  const loader = appManager.getPluginLoader();

  if (!loader) {
    throw new Error(PLUGIN_LOADER_NOT_READY_ERROR);
  }

  return loader;
};

const withPluginLoader = async (action, errorPrefix = '') => {
  const loader = getPluginLoaderOrThrow();

  try {
    return await action(loader);
  } catch (err) {
    if (!errorPrefix) {
      throw err;
    }

    throw new Error(`${errorPrefix}: ${err.message}`);
  }
};

const PLUGIN_ID_PATTERN = /^translime-plugin-[a-z0-9-]+$/;
const OPEN_LINK_ALLOWED_PROTOCOLS = ['http:', 'https:'];
const LOGGER_ALLOWED_LEVELS = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];

/**
 * 校验插件设置访问权限与键名格式。
 *
 * 已归属插件的发送方只能读写自身插件的设置；
 * 插件 ID 必须符合命名约定，避免 `plugin.<id>` 配置键被拼接注入。
 *
 * @param {string} packageName - 目标插件包名。
 * @returns {void} 校验失败时抛出异常。
 */
const ensurePluginSettingAccess = (packageName) => {
  const name = String(packageName || '');
  if (!PLUGIN_ID_PATTERN.test(name)) {
    throw new Error(`非法的插件设置键：${name}`);
  }
  const senderPluginId = resolveSenderPluginId(getIpcSender());
  if (senderPluginId && senderPluginId !== name) {
    throw new Error(`插件 "${senderPluginId}" 不允许读写 "${name}" 的设置`);
  }
};

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
  [ipcType.SET_TITLE_BAR_OVERLAY]({ win = 'app', symbolColor, height } = {}) {
    const targetWin = win === 'app' ? appManager.getWin() : appManager.getChildWin(win);
    if (!targetWin) {
      return;
    }
    const overlayOptions = {
      ...(symbolColor && { symbolColor }),
      ...(height && { height }),
    };
    if (Object.keys(overlayOptions).length === 0) {
      return;
    }
    const modeKey = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    mainStore.config.set(`window.overlayColor.${modeKey}`, overlayOptions);
    targetWin.setTitleBarOverlay({
      color: TITLE_BAR_OVERLAY_COLOR,
      ...overlayOptions,
    });
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
    const rawUrl = String(url || '');
    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl);
    } catch (err) {
      throw new Error(`openLink 仅支持 http/https 链接，无法解析：${rawUrl}`);
    }
    if (!OPEN_LINK_ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
      throw new Error(`openLink 仅支持 http/https 链接，已拦截 ${parsedUrl.protocol} 协议`);
    }
    shell.openExternal(rawUrl);
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
      const isLinux = process.platform === 'linux';
      const minWidth = options.minWidth || 540;
      const mainWinBound = appManager.getWin().getBounds();
      const winBound = mainStore.config.get(`plugin.${name.replace('plugin-window-', '')}.window`, {
        x: mainWinBound.x + 10,
        y: mainWinBound.y + 10,
        width: options.width ? options.width : minWidth,
        height: options.height ? options.height : mainWinBound.height,
      });
      const indexPage = options.windowUrl || 'child-window.html';
      const overlayMode = resolveOverlayMode(
        mainStore.config.get('setting.theme', 'system'),
        nativeTheme.shouldUseDarkColors,
      );
      const savedOverlay = mainStore.config.get(`window.overlayColor.${overlayMode}`);
      let titleBarOverlay = false;
      if (typeof options.titleBarOverlay !== 'undefined') {
        titleBarOverlay = options.titleBarOverlay;
      } else if ((options.titleBarStyle || 'hidden') === 'hidden') {
        titleBarOverlay = resolveTitleBarOverlay({ overlayMode, savedOverlay });
      }
      const appIcon = nativeImage.createFromDataURL(icon);
      const winCreateOptions = {
        width: winBound.width,
        height: winBound.height,
        minWidth,
        icon: appIcon,
        useContentSize:
          typeof options.useContentSize !== 'undefined' ? options.useContentSize : false,
        frame: typeof options.frame !== 'undefined' ? options.frame : true,
        ...(isLinux ? {
          titleBarStyle: options.titleBarStyle || 'default',
        } : {
          titleBarStyle: options.titleBarStyle || 'hidden',
          titleBarOverlay,
        }),
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
          preload: join(dir, '../preload/index.cjs'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          webviewTag: true,
        },
      };
      if (!isLinux) {
        winCreateOptions.x = winBound.x;
        winCreateOptions.y = winBound.y;
      } else {
        winCreateOptions.center = true;
      }
      const win = createWindow(indexPage, winCreateOptions, null);
      appManager.setChildWin(name, win);

      // 独立插件窗口：登记归属，窗口内的 webview guest 可据此关联到插件
      if (name.startsWith('plugin-window-')) {
        attributeSender(win.webContents, name.replace('plugin-window-', ''));
      }

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
          const size = appManager.getChildWin(name).getSize();
          const [width, height] = size;
          let { x } = winBound;
          let { y } = winBound;
          if (!isLinux) {
            const pos = appManager.getChildWin(name).getPosition();
            [x, y] = pos;
          }
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
    return withPluginLoader(async (loader) => {
      const plugins = packageName ? await loader.getPlugin(packageName) : await loader.getPlugins();
      return JSON.parse(JSON.stringify(plugins));
    });
  },
  async [ipcType.INSTALL_PLUGIN](packageString) {
    return withPluginLoader((loader) => {
      const [packageName, version] = packageString.split('@');

      return loader.installPlugin(packageName, version);
    }, '插件安装出错');
  },
  async [ipcType.INSTALL_LOCAL_PLUGIN](packagePath) {
    return withPluginLoader((loader) => loader.installLocalPlugin(packagePath), '插件安装出错');
  },
  async [ipcType.UNINSTALL_PLUGIN](packageName) {
    return withPluginLoader((loader) => loader.uninstallPlugin(packageName), '插件卸载出错');
  },
  async [ipcType.DISABLE_PLUGIN](packageName) {
    return withPluginLoader((loader) => {
      loader.disablePlugin(packageName);
      return true;
    }, '插件停用出错');
  },
  async [ipcType.ENABLE_PLUGIN](packageName) {
    return withPluginLoader(async (loader) => {
      await loader.enablePlugin(packageName);
      return true;
    }, '插件启用出错');
  },
  async [ipcType.ACTIVATE_PLUGIN](packageName, reason = 'manual') {
    return withPluginLoader((loader) => {
      if (reason === 'view') {
        loader.triggerViewActivation(packageName);
      } else {
        loader.enablePlugin(packageName);
      }
      return true;
    }, '插件激活出错');
  },
  async [ipcType.EXECUTE_PLUGIN_COMMAND](commandId, ...args) {
    return withPluginLoader(
      (loader) => loader.executeCommand(commandId, ...args),
      '插件命令执行出错',
    );
  },
  async [ipcType.REFRESH_DEV_PLUGINS]() {
    return withPluginLoader((loader) => {
      loader.refreshDevPlugins();
      return true;
    }, '开发插件刷新失败');
  },
  async [ipcType.GET_PLUGIN_SETTING](packageName) {
    ensurePluginSettingAccess(packageName);
    const settings = mainStore.config.get(`plugin.${packageName}.settings`, {});
    return settings;
  },
  async [ipcType.SET_PLUGIN_SETTING](packageName, key, settings = null) {
    ensurePluginSettingAccess(packageName);
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
    const loader = getPluginLoaderOrThrow();
    return loader.buildPluginMenu(packageName);
  },
  [ipcType.PLUGIN_CONTEXT_MENU_ACTION]({ menuId, itemId } = {}) {
    return dispatchMenuAction(menuId, itemId);
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
  [ipcType.SHOW_TEXT_EDIT_CONTEXT]({ selectedText = '' } = {}) {
    return buildTextEditMenu(getIpcSender(), { selectedText });
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
    // 白名单校验，避免把任意字符串注入 winston 导致日志方法报错
    let logLevel = String(level || '');
    if (logLevel === 'log') {
      logLevel = 'info';
    }
    if (!LOGGER_ALLOWED_LEVELS.includes(logLevel)) {
      logLevel = 'info';
    }
    if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.args) {
      const { args, meta } = payload;

      if (meta && Object.keys(meta).length > 0) {
        // 如果有额外的 metadata (来自 child logger)
        // 合并策略：如果最后一个参数是对象，则合并；否则作为一个新参数追加
        const lastArg = args[args.length - 1];
        if (lastArg && typeof lastArg === 'object' && !Array.isArray(lastArg)) {
          const combinedMeta = { ...meta, ...lastArg };
          logger[logLevel](...args.slice(0, -1), combinedMeta);
        } else {
          logger[logLevel](...args, meta);
        }
      } else {
        logger[logLevel](...args);
      }
    } else {
      // 兼容旧版调用
      const args = Array.isArray(payload) ? payload : [payload];
      logger[logLevel](...args);
    }
  },
  async [ipcType.LOAD_PLUGIN_UI](pluginPath) {
    const normalizedPath = pathResolve(String(pluginPath || ''));
    const allowedRoots = [PLUGIN_MODULES_PATH, PLUGIN_MODULES_PATH_DEV];
    const insidePluginDirs = allowedRoots.some((root) => {
      const rel = relative(root, normalizedPath);
      return Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel);
    });
    if (!insidePluginDirs) {
      throw new Error('load-plugin-ui 仅允许读取插件目录内的 UI 产物');
    }
    // 归属登记：该请求由运行插件 UI 的 webview 文档发起，
    // 据此把发送方 WebContents 关联到插件，供后续 IPC 收口校验使用
    const plugin = appManager.getPluginLoader()?.getPlugins()
      .find((item) => item.ui && relative(item.ui, normalizedPath) === '');
    const sender = getIpcSender();
    if (plugin && sender) {
      attributeSender(sender, plugin.packageName);
    }
    return fs.readFileSync(pluginPath, 'utf8');
  },
  [ipcType.GET_SYSTEM_COLOR]() {
    try {
      if (process.platform === 'win32' || (systemPreferences && typeof systemPreferences.getAccentColor === 'function')) {
        const color = systemPreferences.getAccentColor();
        if (color) {
          // 如果是 Windows，返回的是 RRGGBBAA 格式，需要处理
          if (process.platform === 'win32') {
            return `#${color.substring(0, 6)}`;
          }
          return color.startsWith('#') ? color : `#${color}`;
        }
      }
      return '#20a6fc';
    } catch (e) {
      logger.warn('Failed to get system accent color', e);
      return '#20a6fc';
    }
  },
  [ipcType.GET_PRELOAD_PATH]() {
    return `file://${join(dir, '../preload/index.cjs').replace(/\\/g, '/')}`;
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
