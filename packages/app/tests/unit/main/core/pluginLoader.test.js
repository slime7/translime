import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import EventEmitter from 'node:events';
import nodePath from 'node:path';
import pluginLoader from '@main/core/pluginLoader';
import mainStore from '@main/utils/useMainStore';

import pluginInterop from '@main/core/pluginInterop';

// Mock 必须在导入之前提升或定义
const { mockFs, mockFsp } = vi.hoisted(() => {
  const fs = {
    access: vi.fn(),
    accessSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    createReadStream: vi.fn(),
    createWriteStream: vi.fn(),
    constants: { F_OK: 0 },
  };
  const fsp = {
    mkdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    rm: vi.fn(),
    copyFile: vi.fn(),
  };
  return { mockFs: fs, mockFsp: fsp };
});

vi.mock('node:fs', () => ({
  default: mockFs,
  ...mockFs,
}));

vi.mock('node:fs/promises', () => ({
  default: mockFsp,
  ...mockFsp,
}));

vi.mock('node:stream/promises', () => ({
  __esModule: true,
  pipeline: vi.fn(),
  default: { pipeline: vi.fn() },
}));

vi.mock('node:zlib', () => ({
  default: {
    createGunzip: vi.fn(),
  },
}));

vi.mock('tar', () => ({
  extract: vi.fn(),
}));

// Mock electron net
const mockNetRequest = {
  on: vi.fn(),
  end: vi.fn(),
};

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
  net: {
    request: vi.fn((options) => {
      mockNetRequest.url = typeof options === 'string' ? options : options.url;
      return mockNetRequest;
    }),
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
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock appManager
vi.mock('@main/utils/useAppManager', () => ({
  default: {
    getIpc: vi.fn(),
    getWin: vi.fn(),
    getChildWin: vi.fn(),
    getPluginLoader: vi.fn(),
  },
}));

// Mock pluginInterop
vi.mock('@main/core/pluginInterop', () => ({
  default: {
    register: vi.fn(),
    unregister: vi.fn(),
    getExports: vi.fn(),
    getRegisteredPlugins: vi.fn(),
    waitForPlugin: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

// Mock 插件启用所需的 require
const { mockRequire } = vi.hoisted(() => {
  const req = vi.fn();
  req.cache = {};
  return { mockRequire: req };
});

vi.mock('node:module', () => ({
  default: {
    createRequire: () => mockRequire,
    _extensions: {
      '.node': vi.fn(),
      '.js': vi.fn(),
    },
  },
  createRequire: () => mockRequire,
}));

describe('pluginLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequire.cache = {};
    // 默认 Mock 行为
    mockNetRequest.on.mockReset();
    mockNetRequest.end.mockReset();
    mockFs.createWriteStream.mockReturnValue({
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn((event, cb) => {
        if (event === 'finish') cb();
      }),
      destroy: vi.fn(),
    });
    pluginLoader.plugins = [];
  });

  describe('init', () => {
    it('应该检查并创建插件目录', () => {
      // 模拟 fs.access 回调报错（文件未找到）以触发创建
      mockFs.access.mockImplementation((path, mode, cb) => cb(new Error('not found')));

      pluginLoader.init();

      expect(mockFs.access).toHaveBeenCalled();
      expect(mockFs.writeFileSync).toHaveBeenCalled(); // 应该写入默认的 package.json
    });
  });

  describe('readPlugins', () => {
    it('应该读取插件列表', () => {
      // Mock package.json 内容
      mockFs.readFileSync.mockReturnValueOnce(JSON.stringify({
        dependencies: {
          'translime-plugin-test': '1.0.0',
        },
      }));

      // Mock 插件 package.json
      mockFs.readFileSync.mockReturnValueOnce(JSON.stringify({
        name: 'translime-plugin-test',
        plugin: {
          title: 'Test Plugin',
        },
      }));
      // Mock accessSync 成功以通过验证
      mockFs.accessSync.mockReturnValue(undefined);

      const plugins = pluginLoader.readPlugins();

      expect(plugins).toHaveLength(1);
      expect(plugins[0].packageName).toBe('translime-plugin-test');
      expect(plugins[0].title).toBe('Test Plugin');
    });
  });

  describe('readPlugins: dev state', () => {
    it('开发插件未构建时应标记为 build-missing', () => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        name: 'translime-plugin-dev-test',
        main: './dist/index.cjs.js',
        plugin: {
          title: 'Dev Test Plugin',
          ui: 'dist/ui.esm.js',
        },
      }));

      const existingPaths = new Set([
        nodePath.join(
          '/mock/user/data/plugins_dev/node_modules/translime-plugin-dev-test',
          'package.json',
        ),
      ]);
      mockFs.accessSync.mockImplementation((targetPath) => {
        if (!existingPaths.has(targetPath)) {
          throw new Error('not found');
        }
      });

      const plugin = pluginLoader.readPluginSafe(
        '/mock/user/data/plugins_dev/node_modules/translime-plugin-dev-test',
        {
          source: 'dev',
        },
      );

      expect(plugin.packageName).toBe('translime-plugin-dev-test');
      expect(plugin.status).toBe('build-missing');
      expect(plugin.available).toBe(false);
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

  describe('installPlugin', () => {
    const packageName = 'translime-plugin-demo';
    const version = '1.0.1';
    const tarballUrl = 'http://example.com/plugin.tgz';

    beforeEach(() => {
      // Mock 包元数据响应
      mockNetRequest.on.mockImplementation((event, cb) => {
        if (event === 'response') {
          const response = new EventEmitter();
          response.statusCode = 200;
          response.headers = {};
          cb(response);
          // 模拟数据
          if (mockNetRequest.url && mockNetRequest.url.includes('registry')) {
            response.emit('data', Buffer.from(JSON.stringify({
              version,
              dist: { tarball: tarballUrl },
            })));
            response.emit('end');
          } else {
            // 模拟 tarball 下载
            response.emit('data', Buffer.from('fake-tarball-content'));
            response.emit('end');
          }
        }
      });

      // Mock package.json 读/写
      mockFsp.readFile.mockResolvedValue(JSON.stringify({ dependencies: {} }));
      mockFsp.writeFile.mockResolvedValue();

      // Mock 安装后的插件读取
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        name: packageName,
        version,
        plugin: { title: 'Demo Plugin' },
      }));
    });

    it('应该成功安装插件', async () => {
      // 允许安装继续（假设没有现有插件或卸载成功）
      pluginLoader.plugins = [];

      const result = await pluginLoader.installPlugin(packageName);

      expect(result).toEqual({ success: true, version });
      // 验证元数据获取
      expect(pluginLoader.getPlugin(packageName)).toBeDefined();
    });

    it('如果插件不存在应该报错', async () => {
      mockNetRequest.on.mockImplementation((event, cb) => {
        if (event === 'response') {
          const response = new EventEmitter();
          response.statusCode = 404;
          cb(response);
        }
      });

      await expect(pluginLoader.installPlugin(packageName))
        .rejects.toThrow();
    });
  });

  describe('enablePlugin/disablePlugin', () => {
    it('启用带有 libs 的插件时应注册 interop，禁用时应注销', () => {
      const mockLibs = { sayHello: () => 'hello' };
      mockRequire.mockReturnValue({ libs: mockLibs });

      const packageName = 'translime-plugin-interop-test';

      // 预先构造一个未启用的插件在 pluginLoader.plugins 中
      pluginLoader.plugins = [{
        packageName,
        pluginPath: '/mock/path',
        exports: 'index.js',
        enabled: false,
      }];

      pluginLoader.enablePlugin(packageName);
      expect(pluginInterop.register).toHaveBeenCalledWith(packageName, mockLibs);

      pluginLoader.disablePlugin(packageName);
      expect(pluginInterop.unregister).toHaveBeenCalledWith(packageName);
    });

    it('插件不存在时应返回 false', () => {
      pluginLoader.plugins = [
        {
          packageName: 'translime-plugin-existing',
          pluginPath: '/mock/existing',
          enabled: true,
        },
      ];

      const result = pluginLoader.disablePlugin('translime-plugin-missing');

      expect(result).toBe(false);
      expect(pluginLoader.plugins).toHaveLength(1);
      expect(pluginLoader.plugins[0].packageName).toBe('translime-plugin-existing');
    });

    it('启动阶段初始化插件时也应调用 pluginDidLoad', () => {
      const pluginDidLoad = vi.fn();
      mockRequire.mockReturnValue({ pluginDidLoad });

      pluginLoader.enablePlugins([
        {
          packageName: 'translime-plugin-startup-test',
          pluginPath: '/mock/path',
          exports: 'index.js',
          enabled: true,
          available: true,
        },
      ]);

      expect(pluginDidLoad).toHaveBeenCalledTimes(1);
      expect(pluginLoader.plugins[0].pluginDidLoad).toBe(pluginDidLoad);
    });
  });

  describe('reloadPlugin/refreshDevPlugins', () => {
    it('应能从已链接目录重新扫描开发插件', async () => {
      mockFs.readFileSync.mockReturnValueOnce(JSON.stringify({
        dependencies: {},
      }));
      mockFs.readdirSync.mockReturnValue(['translime-plugin-dev-refresh']);
      mockFs.readFileSync.mockReturnValueOnce(JSON.stringify({
        name: 'translime-plugin-dev-refresh',
        plugin: {
          title: 'Refresh Test',
        },
      }));
      mockFs.accessSync.mockImplementation(() => undefined);

      mainStore.config.get.mockImplementation((key, defaultValue) => {
        if (key === 'setting.showDevPlugin') {
          return true;
        }
        return defaultValue;
      });

      const plugins = pluginLoader.refreshDevPlugins();

      expect(Array.isArray(plugins)).toBe(true);
      expect(
        plugins.some((plugin) => plugin.packageName === 'translime-plugin-dev-refresh'),
      ).toBe(true);
    });
  });
});
