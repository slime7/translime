import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { autoUpdater } from 'electron-updater';
import appManager from '@main/utils/useAppManager';
import autoUpdate, { init } from '@main/core/autoUpdate';

// Mock dependencies
vi.mock('electron-updater', () => ({
  autoUpdater: {
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn(),
    logger: null,
  },
}));

vi.mock('@main/utils/useAppManager', () => ({
  default: {
    getIpc: vi.fn(),
  },
}));

vi.mock('@main/utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('autoUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exports', () => {
    it('应该导出 IPC 处理函数', () => {
      expect(autoUpdate[ipcType.START_DOWNLOAD_UPDATE]).toBeDefined();
      expect(autoUpdate[ipcType.QUIT_AND_INSTALL]).toBeDefined();
      expect(autoUpdate[ipcType.CHECK_FOR_UPDATE]).toBeDefined();
    });

    it('START_DOWNLOAD_UPDATE 应该调用 downloadUpdate', () => {
      autoUpdate[ipcType.START_DOWNLOAD_UPDATE]();
      expect(autoUpdater.downloadUpdate).toHaveBeenCalled();
    });

    it('QUIT_AND_INSTALL 应该调用 quitAndInstall', () => {
      autoUpdate[ipcType.QUIT_AND_INSTALL]();
      expect(autoUpdater.quitAndInstall).toHaveBeenCalled();
    });
  });

  describe('init', () => {
    it('应该绑定事件监听器', () => {
      init();
      expect(autoUpdater.on).toHaveBeenCalledWith('checking-for-update', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('update-available', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('update-not-available', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('download-progress', expect.any(Function));
      expect(autoUpdater.on).toHaveBeenCalledWith('update-downloaded', expect.any(Function));
    });

    it('事件回调应该发送 IPC 消息', () => {
      const mockSend = vi.fn();
      const mockSendToMain = vi.fn();
      appManager.getIpc.mockReturnValue({
        sendToClient: mockSend,
        sendToMain: mockSendToMain,
      });

      const onMap = {};
      autoUpdater.on.mockImplementation((event, cb) => {
        onMap[event] = cb;
      });

      init();

      // Simulate 'checking-for-update'
      if (onMap['checking-for-update']) {
        onMap['checking-for-update']();
        expect(mockSendToMain).toHaveBeenCalledWith(ipcType.UPDATE_CHECKING, null);
      }
    });
  });
});
