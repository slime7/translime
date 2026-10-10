import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import nodePath from 'node:path';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import ipcHandler from '@main/core/ipcHandler';
import appManager from '@main/utils/useAppManager';
import mainStore from '@main/utils/useMainStore';
import logger from '@main/utils/logger';
import ipcContext from '@main/core/ipcContext';
import { attributeSender } from '@main/core/plugin-loader/pluginSenderRegistry';
import { PLUGIN_MODULES_PATH } from '@main/core/plugin-loader/constants';

const {
  mockShell, mockApp, mockDialog, mockNativeTheme, NotificationMock, mockSystemPreferences,
} = vi.hoisted(() => ({
  mockShell: {
    openExternal: vi.fn(),
    openPath: vi.fn().mockResolvedValue(''),
  },
  mockApp: {
    getPath: vi.fn(() => '/mock/user/data'),
    relaunch: vi.fn(),
    quit: vi.fn(),
    setLoginItemSettings: vi.fn(),
  },
  mockDialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    showMessageBox: vi.fn(),
    showErrorBox: vi.fn(),
    showCertificateTrustDialog: vi.fn(),
  },
  mockNativeTheme: {
    shouldUseDarkColors: false,
    themeSource: 'system',
  },
  mockSystemPreferences: {
    getAccentColor: vi.fn(),
  },
  NotificationMock: class {
    constructor() {
      this.show = vi.fn();
      this.on = vi.fn();
      this.close = vi.fn();
    }

    static isSupported() {
      return true;
    }
  },
}));

vi.mock('electron', () => ({
  app: mockApp,
  shell: mockShell,
  dialog: mockDialog,
  nativeTheme: mockNativeTheme,
  systemPreferences: mockSystemPreferences,
  nativeImage: {
    createFromDataURL: vi.fn((url) => url),
  },
  Notification: NotificationMock,
  Menu: {
    buildFromTemplate: vi.fn(() => ({ popup: vi.fn() })),
  },
  clipboard: {
    readText: vi.fn(),
  },
}));

const { mockWin, mockIpc } = vi.hoisted(() => ({
  mockWin: {
    webContents: {
      isDevToolsOpened: vi.fn(),
      openDevTools: vi.fn(),
      closeDevTools: vi.fn(),
    },
    isMaximized: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    minimize: vi.fn(),
    close: vi.fn(),
    reload: vi.fn(),
    setTitleBarOverlay: vi.fn(),
    getBounds: vi.fn(() => ({
      x: 0, y: 0, width: 800, height: 600,
    })),
  },
  mockIpc: {
    sendToClient: vi.fn(),
    appendHandler: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

const { mockCreateWindow } = vi.hoisted(() => ({
  mockCreateWindow: vi.fn(),
}));

vi.mock('@main/utils/useAppManager', () => ({
  default: {
    getWin: vi.fn(() => mockWin),
    getChildWin: vi.fn(),
    getIpc: vi.fn(() => mockIpc),
    getPluginLoader: vi.fn(),
    removeChildWin: vi.fn(),
    setChildWin: vi.fn(),
  },
}));

vi.mock('@main/utils/createWindow', () => ({
  default: mockCreateWindow,
}));

vi.mock('@main/utils/useMainStore', () => ({
  default: {
    config: {
      get: vi.fn((key, defaultValue) => {
        if (key === 'setting.registry') return 'https://registry.npmmirror.com/';
        return defaultValue;
      }),
      set: vi.fn(),
      has: vi.fn(),
    },
    APP_VERSION: '1.0.0',
    APPDATA_PATH: '/mock/appdata',
    ROOT: '/mock/root/main',
  },
}));

// Mock imported modules
vi.mock('@main/core/autoUpdate', () => ({
  default: {
    [ipcType.CHECK_FOR_UPDATE]: vi.fn(),
  },
}));
vi.mock('@main/core/netHandler', () => ({
  default: {},
}));

const { mockFsRead } = vi.hoisted(() => ({
  mockFsRead: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    readFileSync: mockFsRead,
  },
}));

vi.mock('@main/utils/logger', () => ({
  default: {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    http: vi.fn(),
    silly: vi.fn(),
  },
}));

describe('ipcHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNativeTheme.shouldUseDarkColors = false;
    const childWins = {};
    appManager.getWin.mockReturnValue(mockWin);
    appManager.setChildWin.mockImplementation((name, win) => {
      childWins[name] = win;
    });
    appManager.getChildWin.mockImplementation((name) => {
      if (typeof name === 'string') {
        return childWins[name];
      }
      return childWins;
    });
    appManager.removeChildWin.mockImplementation((name) => {
      delete childWins[name];
    });
  });

  describe('Window Control', () => {
    it('DEVTOOLS 应该切换开发者工具', () => {
      mockWin.webContents.isDevToolsOpened.mockReturnValue(false);
      ipcHandler[ipcType.DEVTOOLS]('app');
      expect(mockWin.webContents.openDevTools).toHaveBeenCalled();

      mockWin.webContents.isDevToolsOpened.mockReturnValue(true);
      ipcHandler[ipcType.DEVTOOLS]('app');
      expect(mockWin.webContents.closeDevTools).toHaveBeenCalled();
    });

    it('APP_MAXIMIZE 应该切换最大化状态', () => {
      mockWin.isMaximized.mockReturnValue(false);
      ipcHandler[ipcType.APP_MAXIMIZE]('app');
      expect(mockWin.maximize).toHaveBeenCalled();

      mockWin.isMaximized.mockReturnValue(true);
      ipcHandler[ipcType.APP_MAXIMIZE]('app');
      expect(mockWin.unmaximize).toHaveBeenCalled();
    });

    it('SET_TITLE_BAR_OVERLAY 应该更新目标窗口并持久化', () => {
      mockNativeTheme.shouldUseDarkColors = true;

      ipcHandler[ipcType.SET_TITLE_BAR_OVERLAY]({
        win: 'app',
        symbolColor: '#abcdef',
        height: 32,
      });

      expect(mockWin.setTitleBarOverlay).toHaveBeenCalledWith({
        color: '#00000000',
        symbolColor: '#abcdef',
        height: 32,
      });
      expect(mainStore.config.set).toHaveBeenCalledWith('window.overlayColor.dark', {
        symbolColor: '#abcdef',
        height: 32,
      });
    });

    it('SET_TITLE_BAR_OVERLAY 空 payload 应该跳过', () => {
      ipcHandler[ipcType.SET_TITLE_BAR_OVERLAY]({ win: 'app' });

      expect(mockWin.setTitleBarOverlay).not.toHaveBeenCalled();
      expect(mainStore.config.set).not.toHaveBeenCalled();
    });

    it('SET_TITLE_BAR_OVERLAY 目标窗口不存在时应该跳过', () => {
      ipcHandler[ipcType.SET_TITLE_BAR_OVERLAY]({
        win: 'plugin-window-missing',
        symbolColor: '#ffffff',
      });

      expect(mainStore.config.set).not.toHaveBeenCalled();
    });

    it('OPEN_NEW_WINDOW 应该默认启用覆盖式标题栏', () => {
      const childWin = {
        webContents: {},
        isMinimized: vi.fn(() => false),
        isMaximized: vi.fn(() => false),
        restore: vi.fn(),
        focus: vi.fn(),
        on: vi.fn(),
        getPosition: vi.fn(() => [0, 0]),
        getSize: vi.fn(() => [800, 600]),
      };
      mockCreateWindow.mockReturnValue(childWin);

      ipcHandler[ipcType.OPEN_NEW_WINDOW]({
        name: 'plugin-window-demo',
        options: { title: 'Demo' },
      });

      expect(mockCreateWindow).toHaveBeenCalledTimes(1);
      const options = mockCreateWindow.mock.calls[0][1];
      expect(options.titleBarStyle).toBe('hidden');
      expect(options.titleBarOverlay).toMatchObject({
        color: '#00000000',
        symbolColor: '#1f1f1f',
      });
    });
  });

  describe('Shell & App Integration', () => {
    it('OPEN_LINK 应该调用 shell.openExternal', () => {
      ipcHandler[ipcType.OPEN_LINK]({ url: 'https://example.com' });
      expect(mockShell.openExternal).toHaveBeenCalledWith('https://example.com');
    });

    it('OPEN_LINK 应该拦截非 http/https 协议', () => {
      expect(() => ipcHandler[ipcType.OPEN_LINK]({ url: 'file:///C:/Windows/system32' })).toThrow('openLink');
      const scriptUrl = ['javascript', 'alert(1)'].join(':');
      expect(() => ipcHandler[ipcType.OPEN_LINK]({ url: scriptUrl })).toThrow('openLink');
      expect(mockShell.openExternal).not.toHaveBeenCalled();
    });

    it('APP_VERSIONS 应该返回版本信息', () => {
      const versions = ipcHandler[ipcType.APP_VERSIONS]();
      expect(versions).toHaveProperty('app', '1.0.0');
      expect(versions).toHaveProperty('electron');
    });
  });

  describe('Logger Channel', () => {
    it('LOGGER 应该把白名单之外的日志级别回退为 info', () => {
      ipcHandler[ipcType.LOGGER]('invalid-level', { args: ['hello'] });
      expect(logger.info).toHaveBeenCalledWith('hello');
    });

    it('LOGGER 应该保留白名单内的日志级别', () => {
      ipcHandler[ipcType.LOGGER]('warn', { args: ['careful'] });
      expect(logger.warn).toHaveBeenCalledWith('careful');
    });
  });

  describe('Plugin Settings Access', () => {
    it('SET_PLUGIN_SETTING 应该拒绝归属插件 A 的发送方写插件 B 的设置', async () => {
      const sender = { id: 9001, isDestroyed: vi.fn(() => false) };
      attributeSender(sender, 'translime-plugin-a');

      await expect(ipcContext.run(sender, () => (
        ipcHandler[ipcType.SET_PLUGIN_SETTING]('translime-plugin-b', 'key', 'value')
      ))).rejects.toThrow('不允许读写');
    });

    it('SET_PLUGIN_SETTING 应该拒绝非法插件 ID', async () => {
      await expect(ipcHandler[ipcType.SET_PLUGIN_SETTING]('other.settings', 'key', 'value'))
        .rejects.toThrow('非法的插件设置键');
    });

    it('未归属发送方可以写插件设置（宿主窗口场景）', async () => {
      const result = await ipcHandler[ipcType.SET_PLUGIN_SETTING]('translime-plugin-a', 'key', 'value');
      expect(result).toBe(true);
      expect(mainStore.config.set).toHaveBeenCalledWith('plugin.translime-plugin-a.settings.key', 'value');
    });
  });

  describe('Load Plugin UI', () => {
    it('LOAD_PLUGIN_UI 应该拒绝插件目录之外的路径', async () => {
      await expect(ipcHandler[ipcType.LOAD_PLUGIN_UI]('C:/Windows/system32/config'))
        .rejects.toThrow('load-plugin-ui');
      expect(mockFsRead).not.toHaveBeenCalled();
    });

    it('LOAD_PLUGIN_UI 应该允许插件目录内的产物并登记发送方归属', async () => {
      const pluginUiPath = nodePath.join(
        PLUGIN_MODULES_PATH,
        'translime-plugin-a',
        'dist',
        'ui.esm.js',
      );
      mockFsRead.mockReturnValueOnce('export default {}');
      const sender = { id: 9002, isDestroyed: vi.fn(() => false) };
      const loader = {
        getPlugins: vi.fn(() => [{
          packageName: 'translime-plugin-a',
          ui: pluginUiPath,
        }]),
        onPluginSettingSave: vi.fn(),
      };
      appManager.getPluginLoader.mockReturnValue(loader);

      await ipcContext.run(sender, () => ipcHandler[ipcType.LOAD_PLUGIN_UI](pluginUiPath));

      expect(mockFsRead).toHaveBeenCalledWith(pluginUiPath, 'utf8');
      // 归属登记生效：随后该发送方写自己的设置应被放行
      const result = await ipcContext.run(sender, () => (
        ipcHandler[ipcType.SET_PLUGIN_SETTING]('translime-plugin-a', 'k', 'v')
      ));
      expect(result).toBe(true);
    });
  });

  describe('Dialogs', () => {
    it('SHOW_OPEN_DIALOG 应该调用 dialog.showOpenDialog', async () => {
      await ipcHandler[ipcType.SHOW_OPEN_DIALOG]({ electronOptions: [] });
      expect(mockDialog.showOpenDialog).toHaveBeenCalled();
    });

    it('DIALOG_SHOW_OPEN_DIALOG 应该调用 dialog.showOpenDialog', () => {
      ipcHandler[ipcType.DIALOG_SHOW_OPEN_DIALOG]();
      expect(mockDialog.showOpenDialog).toHaveBeenCalled();
    });
  });

  describe('System Preferences & Colors', () => {
    it('GET_SYSTEM_COLOR 在 Windows 下正常获取颜色并截取前 6 位十六进制', () => {
      const origPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      mockSystemPreferences.getAccentColor.mockReturnValueOnce('123456ff');

      const color = ipcHandler[ipcType.GET_SYSTEM_COLOR]();
      expect(color).toBe('#123456');
      Object.defineProperty(process, 'platform', { value: origPlatform });
    });

    it('GET_SYSTEM_COLOR 在异常或不支持时回退到默认强调色 #20a6fc', () => {
      mockSystemPreferences.getAccentColor.mockImplementationOnce(() => {
        throw new Error('Not supported');
      });

      const color = ipcHandler[ipcType.GET_SYSTEM_COLOR]();
      expect(color).toBe('#20a6fc');
    });
  });

  describe('Linux Shortcuts', () => {
    it('CREATE_LINUX_SHORTCUTS 应该调用快捷方式创建逻辑并返回结果对象', async () => {
      const result = await ipcHandler[ipcType.CREATE_LINUX_SHORTCUTS]();
      expect(result).toHaveProperty('success');
    });
  });
});
