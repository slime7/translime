import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import setupDeepLink, { linkHandler } from '@main/core/deepLink';

const { mockApp } = vi.hoisted(() => ({
  mockApp: {
    getPath: vi.fn(() => '/mock/user/data/translime'),
    setAsDefaultProtocolClient: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  app: mockApp,
}));

vi.mock('@main/utils/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('deepLink', () => {
  const originalDefaultApp = process.defaultApp;
  const originalArgv = process.argv;
  const originalExecPath = process.execPath;
  const mockSendToMain = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.mainStore = {
      ipc: () => ({
        sendToMain: mockSendToMain,
      }),
    };
    mockApp.getPath.mockReturnValue('/mock/user/data/translime');
    process.defaultApp = true;
    process.argv = ['electron.exe', 'path/to/entry.js'];
    process.execPath = '/mock/electron.exe';
  });

  afterEach(() => {
    process.defaultApp = originalDefaultApp;
    process.argv = originalArgv;
    process.execPath = originalExecPath;
    delete global.mainStore;
  });

  it('开发模式下未启用 isolate 时应注册 translime 协议', () => {
    // dev 模式默认注册 translime 协议，与打包版本保持一致
    process.argv = ['electron.exe', 'path/to/entry.js'];
    setupDeepLink();

    expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledWith(
      'translime',
      process.execPath,
      [expect.any(String)],
    );
  });

  it('开发模式下带有 --isolate 参数时应注册 translime-dev 协议', () => {
    // dev:isolate 模式注册专属 translime-dev 协议，隔离开发环境
    process.argv = ['electron.exe', 'path/to/entry.js', '--isolate'];
    setupDeepLink();

    expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledWith(
      'translime-dev',
      process.execPath,
      [expect.any(String)],
    );
  });

  it('开发模式下 userData 目录为 translime-dev 时应注册 translime-dev 协议', () => {
    // 自定义指向 translime-dev 目录时识别为隔离开发模式并注册 translime-dev 协议
    mockApp.getPath.mockReturnValue('/mock/user/data/translime-dev');
    process.argv = ['electron.exe', 'path/to/entry.js'];
    setupDeepLink();

    expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledWith(
      'translime-dev',
      process.execPath,
      [expect.any(String)],
    );
  });

  it('生产模式下应注册 translime 协议', () => {
    // 生产模式注册正式 translime 协议
    process.defaultApp = false;
    setupDeepLink();

    expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledWith('translime');
  });

  it('linkHandler 应正确转发 open 指令到主进程 IPC', () => {
    // 防止回归：深链打开事件需准确通知主进程
    linkHandler('translime://open?foo=bar');

    expect(mockSendToMain).toHaveBeenCalledWith(
      ipcType.DEEP_LINK_OPEN,
      { foo: 'bar' },
    );
  });
});
