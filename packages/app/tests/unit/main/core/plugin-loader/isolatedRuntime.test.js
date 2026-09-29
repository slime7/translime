import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { EventEmitter } from 'node:events';
import {
  activateIsolatedPlugin,
  deactivateIsolatedPlugin,
} from '@main/core/plugin-loader/isolatedRuntime';
import appManager from '@main/utils/useAppManager';
import mainStore from '@main/utils/useMainStore';

const { mockFork, mockUtilityProcess } = vi.hoisted(() => {
  const fork = vi.fn();
  return {
    mockFork: fork,
    mockUtilityProcess: { fork },
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user/data'),
  },
  utilityProcess: mockUtilityProcess,
}));

vi.mock('@main/utils/useMainStore', () => ({
  default: {
    config: {
      get: vi.fn((key, defaultValue) => defaultValue),
      set: vi.fn(),
    },
    APP_VERSION: '0.6.2',
  },
}));

vi.mock('@main/utils/useAppManager', () => ({
  default: {
    getIpc: vi.fn(),
  },
}));

vi.mock('@main/utils/logger', () => ({
  default: {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const createFakeChild = () => {
  const child = new EventEmitter();
  child.postMessage = vi.fn();
  child.kill = vi.fn();
  return child;
};

const createLoader = (plugin) => ({
  plugins: [plugin],
  runtimeCommandHandlers: new Map(),
  emit: vi.fn(),
});

// 每个用例结束时回收控制器：控制器是模块级状态，避免跨用例触发防重复 fork 守卫
const teardownChild = (loader, plugin, child) => {
  deactivateIsolatedPlugin(loader, plugin);
  child.emit('exit', 0);
};

const createPlugin = (overrides = {}) => ({
  packageName: 'translime-plugin-isolated',
  pluginPath: '/mock/plugins/translime-plugin-isolated',
  exports: 'dist/index.cjs.js',
  title: 'Isolated',
  version: '1.0.0',
  isolated: true,
  enabled: true,
  active: false,
  dependencies: [],
  blockedBy: [],
  missingDependencies: [],
  entryIssues: [],
  status: 'activating',
  statusText: '',
  lastError: '',
  hostRequirement: null,
  hostCompatible: true,
  ...overrides,
});

describe('isolatedRuntime', () => {
  let fakeIpc;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeIpc = {
      appendHandler: vi.fn(() => true),
      removeHandler: vi.fn(() => true),
      sendToClient: vi.fn(),
    };
    appManager.getIpc.mockReturnValue(fakeIpc);
  });

  it('激活时应 fork 子进程并在 register 后完成状态切换与桥接注册', () => {
    const child = createFakeChild();
    mockFork.mockReturnValueOnce(child);

    const plugin = createPlugin();
    const loader = createLoader(plugin);
    const cleanup = vi.fn();

    activateIsolatedPlugin(loader, plugin, { cleanup });

    expect(mockFork).toHaveBeenCalledTimes(1);
    const [childPath, , options] = mockFork.mock.calls[0];
    expect(childPath).toContain('isolated-child');
    expect(options.env.TRANSLIME_ISOLATED_PLUGIN).toBe(plugin.packageName);
    expect(options.env.TRANSLIME_PLUGIN_ENTRY).toContain('index.cjs.js');

    // 子进程就绪后，宿主下发激活载荷（含插件设置）
    child.emit('message', { channel: 'ready' });
    const activateMessage = child.postMessage.mock.calls.map(([msg]) => msg)
      .find((msg) => msg.channel === 'activate');
    expect(activateMessage.pluginId).toBe(plugin.packageName);
    expect(activateMessage.payload.hostVersion).toBe('0.6.2');

    // 子进程完成 pluginDidLoad 并上报注册结果
    child.emit('message', {
      channel: 'register',
      ipcTypes: ['query'],
      commands: ['isolated.run'],
      hasLibs: false,
    });

    expect(plugin.active).toBe(true);
    expect(plugin.enabled).toBe(true);
    expect(plugin.ipcHandlers).toEqual([{ type: 'query' }]);
    expect(fakeIpc.appendHandler).toHaveBeenCalledWith(
      'query@translime-plugin-isolated',
      expect.any(Function),
      { owner: plugin.packageName },
    );
    expect(loader.runtimeCommandHandlers.get('isolated.run').pluginId).toBe(plugin.packageName);
    expect(loader.emit).toHaveBeenCalledWith('plugin:enabled', expect.objectContaining({
      pluginId: plugin.packageName,
    }));
    expect(mainStore.config.set).toHaveBeenCalledWith('plugin.translime-plugin-isolated.enabled', true);

    teardownChild(loader, plugin, child);
  });

  it('隔离插件导出 libs 时应忽略并保持 libs 为空', () => {
    const child = createFakeChild();
    mockFork.mockReturnValueOnce(child);

    const plugin = createPlugin();
    const loader = createLoader(plugin);
    activateIsolatedPlugin(loader, plugin, { cleanup: vi.fn() });

    child.emit('message', { channel: 'ready' });
    child.emit('message', {
      channel: 'register',
      ipcTypes: [],
      commands: [],
      hasLibs: true,
    });

    expect(plugin.libs).toBeNull();

    teardownChild(loader, plugin, child);
  });

  it('子进程上报 load-error 时应标记加载失败并停止子进程', () => {
    const child = createFakeChild();
    mockFork.mockReturnValueOnce(child);

    const plugin = createPlugin();
    const loader = createLoader(plugin);
    activateIsolatedPlugin(loader, plugin, { cleanup: vi.fn() });

    child.emit('message', { channel: 'load-error', error: '入口加载失败：模块缺失' });

    expect(plugin.status).toBe('load-error');
    expect(plugin.statusText).toContain('模块缺失');
    expect(plugin.enabled).toBe(false);
    expect(loader.emit).toHaveBeenCalledWith('plugin:error', expect.objectContaining({
      pluginId: plugin.packageName,
    }));

    teardownChild(loader, plugin, child);
  });

  it('子进程意外退出时应清理注册并标记崩溃', () => {
    const child = createFakeChild();
    mockFork.mockReturnValueOnce(child);

    const plugin = createPlugin();
    const loader = createLoader(plugin);
    const cleanup = vi.fn();
    activateIsolatedPlugin(loader, plugin, { cleanup });

    child.emit('message', { channel: 'ready' });
    child.emit('message', {
      channel: 'register', ipcTypes: [], commands: [], hasLibs: false,
    });
    child.emit('exit', 1);

    expect(cleanup).toHaveBeenCalledWith(plugin);
    expect(plugin.status).toBe('load-error');
    expect(plugin.statusText).toContain('异常退出');
  });

  it('停用时应通知子进程卸载并等待退出', () => {
    const child = createFakeChild();
    mockFork.mockReturnValueOnce(child);

    const plugin = createPlugin();
    const loader = createLoader(plugin);
    activateIsolatedPlugin(loader, plugin, { cleanup: vi.fn() });
    child.emit('message', { channel: 'ready' });
    child.emit('message', {
      channel: 'register', ipcTypes: [], commands: [], hasLibs: false,
    });

    deactivateIsolatedPlugin(loader, plugin);

    const unloadMessage = child.postMessage.mock.calls.map(([msg]) => msg)
      .find((msg) => msg.channel === 'unload');
    expect(unloadMessage).toBeDefined();

    // 子进程确认卸载后不再强杀（exit 事件取消 kill 定时器）
    child.emit('message', { channel: 'unloaded' });
    child.emit('exit', 0);
    expect(plugin.status).not.toBe('load-error');
  });

  it('fork 失败时应直接标记 load-error', () => {
    mockFork.mockImplementationOnce(() => {
      throw new Error('fork unavailable');
    });

    const plugin = createPlugin();
    const loader = createLoader(plugin);
    activateIsolatedPlugin(loader, plugin, { cleanup: vi.fn() });

    expect(plugin.status).toBe('load-error');
    expect(plugin.statusText).toContain('fork unavailable');
  });
});
