import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import ipcHandler from '@main/core/ipcHandler';
import appManager from '@main/utils/useAppManager';

const {
  mockShell, mockApp, mockDialog, mockNativeTheme, NotificationMock,
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
});
