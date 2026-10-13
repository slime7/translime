import {
  mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  closeDevPluginWatchers,
  syncDevPluginWatchers,
} from '@main/core/plugin-loader/devPluginWatcher';

// node:fs 仅 mock watch，其余保持真实实现（检测器依赖真实 stat/readdir）
const { mockWatch } = vi.hoisted(() => ({
  mockWatch: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      watch: mockWatch,
    },
    watch: mockWatch,
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user/data'),
  },
}));

vi.mock('@main/utils/useMainStore', () => ({
  default: {
    config: {
      get: vi.fn((key, defaultVal) => (key === 'setting.showDevPlugin' ? true : defaultVal)),
      set: vi.fn(),
    },
  },
}));

vi.mock('@main/utils/useAppManager', () => ({
  default: {
    getIpc: vi.fn(() => null),
  },
}));

vi.mock('@main/utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

/**
 * 构造插件列表可变的假 loader。
 *
 * @param {Array<object>} plugins - 插件对象列表。
 * @returns {object} 带 restartPlugin 记录的 loader 桩。
 */
const createFakeLoader = (plugins) => {
  const loader = {
    plugins,
    restartPlugin: vi.fn((packageName) => loader.plugins
      .find((plugin) => plugin.packageName === packageName)),
    getPlugin: (name) => loader.plugins.find((plugin) => plugin.packageName === name),
  };
  return loader;
};

/**
 * 创建带 dist 产物的临时插件目录。
 *
 * @param {string} packageName - 插件包名。
 * @returns {string} 插件根目录。
 */
const createPluginDir = (packageName) => {
  const pluginPath = mkdtempSync(path.join(tmpdir(), `translime-dpw-${packageName}`));
  mkdirSync(path.join(pluginPath, 'dist'), { recursive: true });
  writeFileSync(path.join(pluginPath, 'dist', 'index.cjs.js'), 'module.exports = {};', 'utf8');
  return pluginPath;
};

describe('devPluginWatcher', () => {
  let pluginDirs = [];

  beforeEach(() => {
    vi.useFakeTimers();
    pluginDirs = [];
    mockWatch.mockReset();
    mockWatch.mockImplementation((_dir, _options, callback) => {
      mockWatch.lastCallback = callback;
      return {
        close: vi.fn(),
        on: vi.fn(),
      };
    });
  });

  afterEach(() => {
    closeDevPluginWatchers();
    vi.useRealTimers();
    pluginDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  });

  it('自动重启失败进入 load-error 的开发插件保留 dist 监听，产物再变化时继续重试', async () => {
    const pluginPath = createPluginDir('load-error-keep');
    pluginDirs.push(pluginPath);
    const plugin = {
      packageName: 'translime-plugin-load-error-keep',
      pluginPath,
      dev: true,
      enabled: false,
      status: 'load-error',
      lastError: '产物缺失',
    };
    const loader = createFakeLoader([plugin]);

    syncDevPluginWatchers(loader);
    expect(mockWatch).toHaveBeenCalledTimes(1);

    // 产物再次变化（构建完成）触发重启自愈，不再要求手动重启
    writeFileSync(path.join(pluginPath, 'dist', 'index.cjs.js'), 'module.exports = { fixed: true };', 'utf8');
    mockWatch.lastCallback('change', 'index.cjs.js');
    await vi.advanceTimersByTimeAsync(800);
    expect(loader.restartPlugin).toHaveBeenCalledWith('translime-plugin-load-error-keep');
  });

  it('用户手动停用的开发插件不再监听与重启', async () => {
    const pluginPath = createPluginDir('user-disabled');
    pluginDirs.push(pluginPath);
    const plugin = {
      packageName: 'translime-plugin-user-disabled',
      pluginPath,
      dev: true,
      enabled: false,
      status: 'ready',
    };
    const loader = createFakeLoader([plugin]);

    syncDevPluginWatchers(loader);
    expect(mockWatch).not.toHaveBeenCalled();
  });

  it('插件从启用转为用户停用后，既有监听被移除', () => {
    const pluginPath = createPluginDir('watch-then-disable');
    pluginDirs.push(pluginPath);
    const plugin = {
      packageName: 'translime-plugin-watch-then-disable',
      pluginPath,
      dev: true,
      enabled: true,
      status: 'active',
    };
    const loader = createFakeLoader([plugin]);

    syncDevPluginWatchers(loader);
    expect(mockWatch).toHaveBeenCalledTimes(1);
    const watcher = mockWatch.mock.results[0].value;

    plugin.enabled = false;
    plugin.status = 'ready';
    syncDevPluginWatchers(loader);
    expect(watcher.close).toHaveBeenCalledTimes(1);
  });
});
