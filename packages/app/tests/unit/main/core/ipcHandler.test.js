import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import ipcHandler from '@main/core/ipcHandler';
import appManager from '@main/utils/useAppManager';

const {
  mockShell, mockApp, mockDialog, mockNativeTheme,
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
}));

vi.mock('electron', () => ({
  app: mockApp,
  shell: mockShell,
  dialog: mockDialog,
  nativeTheme: mockNativeTheme,
  Notification: class {
    static isSupported() { return true; }

    show() {}

    on() {}

    close() {}
  },
  Menu: {
    buildFromTemplate: vi.fn(() => ({ popup: vi.fn() })),
  },
  clipboard: {
    readText: vi.fn(),
  },
}));

vi.mock('@/utils/createWindow', () => ({
  default: vi.fn(() => ({
    on: vi.fn(),
    webContents: {
      send: vi.fn(),
    },
  })),
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
      get: vi.fn((key) => {
        if (key === 'setting.registry') return 'https://registry.npmmirror.com/';
        return undefined;
      }),
      set: vi.fn(),
      has: vi.fn(),
    },
    APP_VERSION: '1.0.0',
    APPDATA_PATH: '/mock/appdata',
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
    appManager.getWin.mockReturnValue(mockWin);
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
    it('SHOW_OPEN_DIALOG 应该调用 dialog.showSaveDialog (根据源码逻辑)', async () => {
      // 注意源码中 SHOW_OPEN_DIALOG 调用的是 dialog.showSaveDialog 可能是 bug 或故意为之？
      // 原文: return dialog.showSaveDialog(...electronOptions);
      // 测试应该反映实际代码行为
      await ipcHandler[ipcType.SHOW_OPEN_DIALOG]({ electronOptions: [] });
      expect(mockDialog.showSaveDialog).toHaveBeenCalled();
    });

    it('DIALOG_SHOW_OPEN_DIALOG 应该调用 dialog.showOpenDialog', () => {
      ipcHandler[ipcType.DIALOG_SHOW_OPEN_DIALOG]();
      expect(mockDialog.showOpenDialog).toHaveBeenCalled();
    });
  });
});
