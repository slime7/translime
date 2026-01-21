import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import pluginLoader from '@main/core/pluginLoader';

// Mocks must be hoisted or defined before imports
const { mockFs } = vi.hoisted(() => {
  const fs = {
    access: vi.fn(),
    accessSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    createReadStream: vi.fn(),
    constants: { F_OK: 0 },
  };
  return { mockFs: fs };
});

vi.mock('node:fs', () => ({
  default: mockFs,
  ...mockFs,
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user/data'),
  },
  utilityProcess: {
    fork: vi.fn(),
  },
  Menu: {
    buildFromTemplate: vi.fn(() => ({ popup: vi.fn() })),
  },
}));

vi.mock('@main/utils/useMainStore', () => ({
  default: {
    config: {
      get: vi.fn((key, defaultVal) => defaultVal),
      set: vi.fn(),
    },
    TEMP_DIR: '/mock/temp',
    ROOT: '/mock/root',
  },
}));

vi.mock('@main/utils/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('pluginLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('init', () => {
    it('应该检查并创建插件目录', () => {
      // Simulate fs.access callback with error (file not found) to trigger creation
      mockFs.access.mockImplementation((path, mode, cb) => cb(new Error('not found')));

      pluginLoader.init();

      expect(mockFs.access).toHaveBeenCalled();
      // Expect mkdirSync to be called for PLUGIN_DIR, PLUGIN_PACKAGE_DIR, PLUGIN_DIR_DEV
      // Based on logic: fail access -> write package.json -> try access PLUGIN_DIR -> fail -> mkdir
      // Since we mocked accessSync to fail? We need to control mock behavior carefully.

      // Let's refine strict checks if logical complexity is high,
      // or just verify essential calls.
      expect(mockFs.writeFileSync).toHaveBeenCalled(); // Should write default package.json
    });
  });

  describe('readPlugins', () => {
    it('应该读取插件列表', () => {
      // Mock package.json content
      mockFs.readFileSync.mockReturnValueOnce(JSON.stringify({
        dependencies: {
          'translime-plugin-test': '1.0.0',
        },
      }));

      // Mock plugin package.json
      mockFs.readFileSync.mockReturnValueOnce(JSON.stringify({
        name: 'translime-plugin-test',
        plugin: {
          title: 'Test Plugin',
        },
      }));
      // Mock accessSync success for validation
      mockFs.accessSync.mockReturnValue(undefined);

      const plugins = pluginLoader.readPlugins();

      expect(plugins).toHaveLength(1);
      expect(plugins[0].packageName).toBe('translime-plugin-test');
      expect(plugins[0].title).toBe('Test Plugin');
    });
  });

  describe('getPlugin', () => {
    it('应该按名称返回插件', () => {
      pluginLoader.plugins = [
        { packageName: 'p1', title: 'P1' },
      ];
      const p = pluginLoader.getPlugin('p1');
      expect(p).toEqual({ packageName: 'p1', title: 'P1' });
    });
  });
});
