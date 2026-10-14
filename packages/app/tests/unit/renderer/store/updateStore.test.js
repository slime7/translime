import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import useUpdateStore from '@/store/updateStore';

const { handlers, ipcMock, toastMock } = vi.hoisted(() => {
  const registered = {};
  return {
    handlers: registered,
    ipcMock: {
      invoke: vi.fn(),
      send: vi.fn(),
      on: vi.fn((type, handler) => {
        registered[type] = handler;
      }),
      detach: vi.fn(),
    },
    toastMock: { show: vi.fn() },
  };
});

vi.mock('@/hooks/electron', () => ({
  useIpc: () => ipcMock,
}));

vi.mock('@/hooks/useToast', () => ({
  default: () => toastMock,
}));

const mountStore = () => {
  setActivePinia(createPinia());
  return useUpdateStore();
};

describe('updateStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(handlers).forEach((key) => {
      delete handlers[key];
    });
  });

  afterEach(() => {
    setActivePinia(createPinia());
  });

  describe('hasUpdate', () => {
    // 防止的回归：新版角标的显示范围漂移，导致"已下载待安装"等仍需提示的状态丢失入口提示
    it.each([
      ['available', true],
      ['downloading', true],
      ['downloaded', true],
      ['checking', false],
      ['not-available', false],
      ['error', false],
      ['', false],
    ])('状态为 %s 时 hasUpdate 为 %s', (status, expected) => {
      const store = mountStore();
      store.status = status;

      expect(store.hasUpdate).toBe(expected);
    });
  });

  describe('initListeners', () => {
    // 防止的回归：更新事件只被关于页消费时，未打开过关于页的用户完全收不到新版本提示
    it('收到发现新版本事件后进入可用状态并提示', () => {
      const store = mountStore();

      store.initListeners();
      handlers[ipcType.UPDATE_AVAILABLE]({ version: '1.2.0' });

      expect(store.status).toBe('available');
      expect(store.info).toEqual({ version: '1.2.0' });
      expect(store.hasUpdate).toBe(true);
      expect(toastMock.show).toHaveBeenCalledWith('发现新版本 v1.2.0');
    });

    it('下载进度与下载完成后正确流转状态并提示', () => {
      const store = mountStore();
      store.downloading = true;

      store.initListeners();
      handlers[ipcType.UPDATE_DOWNLOAD_PROGRESS]({ percent: 50 });
      expect(store.status).toBe('downloading');
      expect(store.downloading).toBe(true);

      handlers[ipcType.UPDATE_DOWNLOADED]({ version: '1.2.0' });
      expect(store.status).toBe('downloaded');
      expect(store.downloading).toBe(false);
      expect(toastMock.show).toHaveBeenCalledWith('更新已下载，下次启动时自动生效');
    });

    // 防止的回归：监听重复注册会让同一条更新事件弹出多个 toast
    it('重复初始化不会重复注册监听', () => {
      const store = mountStore();

      store.initListeners();
      store.initListeners();

      expect(ipcMock.on).toHaveBeenCalledTimes(6);

      handlers[ipcType.UPDATE_AVAILABLE]({ version: '1.2.0' });
      expect(toastMock.show).toHaveBeenCalledTimes(1);
    });
  });

  describe('动作', () => {
    it('startDownload 置下载态并请求主进程下载', () => {
      const store = mountStore();

      store.startDownload();

      expect(store.downloading).toBe(true);
      expect(ipcMock.send).toHaveBeenCalledWith(ipcType.START_DOWNLOAD_UPDATE);
    });

    it('checkForUpdate 与 quitAndInstall 转发对应 IPC 事件', () => {
      const store = mountStore();

      store.checkForUpdate();
      store.quitAndInstall();

      expect(ipcMock.send).toHaveBeenCalledWith(ipcType.CHECK_FOR_UPDATE);
      expect(ipcMock.send).toHaveBeenCalledWith(ipcType.QUIT_AND_INSTALL);
    });
  });
});
