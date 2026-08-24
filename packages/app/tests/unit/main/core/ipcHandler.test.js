import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import ipcHandler from '@main/core/ipcHandler';
import appManager from '@main/utils/useAppManager';
import mainStore from '@main/utils/useMainStore';

const {
  mockShell, mockApp, mockDialog, mockNativeTheme, NotificationMock, mockSystemPreferences,
} = vi.hoisted(() => ({
  mockShell: {
    openExternal: vi.fn(),
    openPath: vi.fn().mockResolvedValue(''),
  },
  mockApp: {
    getPath: vi.fn(),
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

    it('APP_VERSIONS 应该返回版本信息', () => {
      const versions = ipcHandler[ipcType.APP_VERSIONS]();
      expect(versions).toHaveProperty('app', '1.0.0');
      expect(versions).toHaveProperty('electron');
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

  describe('Plugin Development Actions', () => {
    it('REFRESH_DEV_PLUGINS 应转发到 pluginLoader.refreshDevPlugins', async () => {
      const loader = {
        refreshDevPlugins: vi.fn(() => [{ packageName: 'translime-plugin-dev' }]),
      };
      appManager.getPluginLoader.mockReturnValue(loader);

      const result = await ipcHandler[ipcType.REFRESH_DEV_PLUGINS]();

      expect(loader.refreshDevPlugins).toHaveBeenCalled();
      expect(result).toBe(true);
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
});
