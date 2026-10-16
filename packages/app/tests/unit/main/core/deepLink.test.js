import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import setupDeepLink, { linkHandler } from '@main/core/deepLink';
import deepLinkRegistry from '@main/core/deepLinkRegistry';

const { mockApp, mockPluginLoader } = vi.hoisted(() => ({
  mockApp: {
    getPath: vi.fn(() => '/mock/user/data/translime'),
    setAsDefaultProtocolClient: vi.fn(),
  },
  mockPluginLoader: {
    getPlugin: vi.fn(),
    enablePlugin: vi.fn(async () => ({})),
  },
}));

vi.mock('electron', () => ({
  app: mockApp,
}));

vi.mock('@main/core/pluginLoader', () => ({
  default: mockPluginLoader,
}));

vi.mock('@main/utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
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
    // 防止回归：dev 默认模式应恢复使用与 build 相同的数据与协议，避免强制切成 translime-dev
    process.argv = ['electron.exe', 'path/to/entry.js'];
    setupDeepLink();

    expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledWith(
      'translime',
      process.execPath,
      [expect.any(String)],
    );
  });

  it('开发模式下带有 --isolate 参数时应注册 translime-dev 协议', () => {
    // 防止回归：dev:isolate 模式必须使用专属 translime-dev 协议，避免覆盖安装版协议
    process.argv = ['electron.exe', 'path/to/entry.js', '--isolate'];
    setupDeepLink();

    expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledWith(
      'translime-dev',
      process.execPath,
      [expect.any(String)],
    );
  });

  it('开发模式下 userData 目录为 translime-dev 时应注册 translime-dev 协议', () => {
    // 防止回归：通过 user-data-dir 指向 translime-dev 的实例也应识别为隔离开发模式
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
    // 防止回归：生产打包安装版应稳定注册正式 translime 协议
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

  describe('plugin 深链转发', () => {
    const PLUGIN_ID = 'translime-plugin-scrcpy-wrapper';
    const handler = vi.fn();

    beforeEach(() => {
      handler.mockClear();
      mockPluginLoader.getPlugin.mockReset();
      mockPluginLoader.enablePlugin.mockClear().mockResolvedValue({});
      deepLinkRegistry.setDeepLinkHandlers(PLUGIN_ID, { mirror: handler });
    });

    afterEach(() => {
      deepLinkRegistry.clearDeepLinkHandlers(PLUGIN_ID);
    });

    const mockEnabledPlugin = () => {
      mockPluginLoader.getPlugin.mockImplementation((name) => (
        name === PLUGIN_ID ? { packageName: PLUGIN_ID, enabled: true } : undefined
      ));
    };

    it('插件深链应先激活插件再分发到注册的处理函数（防止深链打不开未激活插件的功能）', async () => {
      // 防止回归：插件名支持省略 translime-plugin- 前缀
      mockEnabledPlugin();
      linkHandler('translime://plugin/scrcpy-wrapper/mirror?serial=abc');

      await vi.waitFor(() => {
        expect(handler).toHaveBeenCalledTimes(1);
      });
      expect(mockPluginLoader.enablePlugin).toHaveBeenCalledWith(PLUGIN_ID);
      expect(handler).toHaveBeenCalledWith({
        path: 'mirror',
        params: { serial: 'abc' },
      });
      expect(mockSendToMain).not.toHaveBeenCalled();
    });

    it('完整包名深链与短名等价（防止完整包名被前缀拼接解析失败）', async () => {
      mockEnabledPlugin();
      linkHandler(`translime://plugin/${PLUGIN_ID}/mirror`);

      await vi.waitFor(() => {
        expect(handler).toHaveBeenCalledTimes(1);
      });
    });

    it('插件未启用时忽略深链，不激活也不分发（防止深链唤醒用户停用的插件）', async () => {
      mockPluginLoader.getPlugin.mockReturnValue({ packageName: PLUGIN_ID, enabled: false });
      linkHandler('translime://plugin/scrcpy-wrapper/mirror');

      await Promise.resolve();
      expect(mockPluginLoader.enablePlugin).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });

    it('插件不存在时安全忽略（防止外部深链打崩宿主）', async () => {
      mockPluginLoader.getPlugin.mockReturnValue(undefined);
      linkHandler('translime://plugin/not-exist/mirror');

      await Promise.resolve();
      expect(mockPluginLoader.enablePlugin).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
