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
});
