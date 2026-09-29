import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const { mockFs, mockMainStore } = vi.hoisted(() => ({
  mockFs: {
    accessSync: vi.fn(),
    readFileSync: vi.fn(),
  },
  mockMainStore: {
    config: {
      get: vi.fn((key, defaultValue) => defaultValue),
    },
    APP_VERSION: '0.6.2',
  },
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user/data'),
  },
}));

vi.mock('node:fs', () => ({
  default: mockFs,
  ...mockFs,
}));

vi.mock('@main/utils/useMainStore', () => ({
  default: mockMainStore,
}));

describe('plugin-loader/metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('readPluginSafe 应该归一化插件元数据', async () => {
    const { readPluginSafe } = await import('@main/core/plugin-loader/metadata');

    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      name: 'translime-plugin-demo',
      version: '1.0.0',
      description: 'Demo plugin',
      author: { name: 'Tester' },
      main: 'dist/index.cjs',
      plugin: {
        commands: [{ id: 'ignored' }],
        contributes: {
          commands: [{ id: 'demo.run', title: 'Run Demo' }],
        },
      },
    }));

    mockFs.accessSync.mockImplementation((targetPath) => {
      const normalizedPath = String(targetPath).replace(/\\/g, '/');
      if (
        !normalizedPath.endsWith('/package.json')
        && !normalizedPath.endsWith('/dist/index.cjs')
      ) {
        throw new Error('not found');
      }
    });

    const plugin = readPluginSafe('/mock/plugins/translime-plugin-demo');

    expect(plugin.packageName).toBe('translime-plugin-demo');
    expect(plugin.author).toBe('Tester');
    expect(plugin.activationEvents).toEqual(['onStartup']);
    expect(plugin.contributes.commands).toEqual([{ id: 'demo.run', title: 'Run Demo' }]);
    expect(plugin.status).toBe('discovered');
    expect(plugin.available).toBe(true);
  });

  it('refreshPluginStatus 应该在依赖缺失时返回 blocked', async () => {
    const { refreshPluginStatus } = await import('@main/core/plugin-loader/metadata');

    const plugin = refreshPluginStatus({
      active: false,
      entryIssues: [],
      missingDependencies: ['translime-plugin-base'],
      blockedBy: [],
      cycleDependencies: [],
      status: 'ready',
      lastError: '',
    });

    expect(plugin.status).toBe('blocked');
    expect(plugin.available).toBe(false);
    expect(plugin.statusText).toContain('缺少前置插件');
  });

  it('未声明 engines.translime 的旧插件应默认视为兼容', async () => {
    const { readPluginSafe } = await import('@main/core/plugin-loader/metadata');

    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      name: 'translime-plugin-legacy',
      version: '1.0.0',
      main: 'dist/index.cjs',
      plugin: { title: 'Legacy' },
    }));
    mockFs.accessSync.mockImplementation((targetPath) => {
      const normalizedPath = String(targetPath).replace(/\\/g, '/');
      if (!normalizedPath.endsWith('/package.json') && !normalizedPath.endsWith('/dist/index.cjs')) {
        throw new Error('not found');
      }
    });

    const plugin = readPluginSafe('/mock/plugins/translime-plugin-legacy');

    expect(plugin.status).toBe('discovered');
    expect(plugin.hostRequirement).toBeNull();
    expect(plugin.hostCompatible).toBe(true);
    expect(plugin.available).toBe(true);
  });

  it('engines.translime 范围不满足时应标记 incompatible 并强制停用', async () => {
    const { readPluginSafe } = await import('@main/core/plugin-loader/metadata');

    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      name: 'translime-plugin-future',
      version: '2.0.0',
      main: 'dist/index.cjs',
      engines: { translime: '>=9.9.9' },
      plugin: { title: 'Future' },
    }));
    mockFs.accessSync.mockImplementation((targetPath) => {
      const normalizedPath = String(targetPath).replace(/\\/g, '/');
      if (!normalizedPath.endsWith('/package.json') && !normalizedPath.endsWith('/dist/index.cjs')) {
        throw new Error('not found');
      }
    });

    const plugin = readPluginSafe('/mock/plugins/translime-plugin-future');

    expect(plugin.status).toBe('incompatible');
    expect(plugin.available).toBe(false);
    expect(plugin.enabled).toBe(false);
    expect(plugin.hostRequirement).toBe('>=9.9.9');
    expect(plugin.statusText).toContain('0.6.2');
  });

  it('engines.translime 范围满足时应正常可用', async () => {
    const { readPluginSafe } = await import('@main/core/plugin-loader/metadata');

    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      name: 'translime-plugin-current',
      version: '1.0.0',
      main: 'dist/index.cjs',
      engines: { translime: '>=0.6.0' },
      plugin: { title: 'Current' },
    }));
    mockFs.accessSync.mockImplementation((targetPath) => {
      const normalizedPath = String(targetPath).replace(/\\/g, '/');
      if (!normalizedPath.endsWith('/package.json') && !normalizedPath.endsWith('/dist/index.cjs')) {
        throw new Error('not found');
      }
    });

    const plugin = readPluginSafe('/mock/plugins/translime-plugin-current');

    expect(plugin.status).toBe('discovered');
    expect(plugin.available).toBe(true);
  });

  it('清单缺少 main 入口的纯 UI 插件应保持可用并给出警告', async () => {
    const { readPluginSafe } = await import('@main/core/plugin-loader/metadata');

    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      name: 'translime-plugin-ui-only',
      version: '1.0.0',
      plugin: {
        title: 'UI Only',
        ui: 'dist/ui.esm.js',
      },
    }));
    mockFs.accessSync.mockImplementation((targetPath) => {
      const normalizedPath = String(targetPath).replace(/\\/g, '/');
      if (!normalizedPath.endsWith('/package.json') && !normalizedPath.endsWith('/dist/ui.esm.js')) {
        throw new Error('not found');
      }
    });

    const plugin = readPluginSafe('/mock/plugins/translime-plugin-ui-only');

    expect(plugin.status).toBe('discovered');
    expect(plugin.available).toBe(true);
    expect(plugin.manifestWarnings.some((warning) => warning.includes('UI 插件'))).toBe(true);
  });

  it('无法识别的激活事件与缺 id 命令应进入 manifestWarnings 而非静默丢弃', async () => {
    const { readPluginSafe } = await import('@main/core/plugin-loader/metadata');

    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      name: 'translime-plugin-warny',
      version: '1.0.0',
      main: 'dist/index.cjs',
      plugin: {
        title: 'Warny',
        activationEvents: ['onStartup', 'onHalloween'],
        contributes: {
          commands: [{ title: '没有 id' }, { id: 'warny.run', title: 'Run' }],
        },
      },
    }));
    mockFs.accessSync.mockImplementation((targetPath) => {
      const normalizedPath = String(targetPath).replace(/\\/g, '/');
      if (!normalizedPath.endsWith('/package.json') && !normalizedPath.endsWith('/dist/index.cjs')) {
        throw new Error('not found');
      }
    });

    const plugin = readPluginSafe('/mock/plugins/translime-plugin-warny');

    expect(plugin.activationEvents).toEqual(['onStartup']);
    expect(plugin.contributes.commands).toEqual([{ id: 'warny.run', title: 'Run' }]);
    expect(plugin.manifestWarnings).toHaveLength(2);
    expect(plugin.manifestWarnings[0]).toContain('onHalloween');
    expect(plugin.manifestWarnings[1]).toContain('1 项缺少 id');
  });
});
