import fs from 'node:fs';
import {
  afterAll, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  PLUGIN_DIR,
  PLUGIN_DIR_DEV,
  PLUGIN_JSON_PATH,
  PLUGIN_MODULES_PATH_DEV,
  PLUGIN_PACKAGE_DIR,
} from '@main/core/plugin-loader/constants';
import { initPluginLoader } from '@main/core/plugin-loader/discovery';

// 目录初始化必须在真实文件系统上验证：全新 userData 下目录层级不存在正是触发 ENOENT 的前提
const { testUserDataDir } = vi.hoisted(() => {
  const base = process.env.TEMP || process.env.TMPDIR || '/tmp';
  return {
    testUserDataDir: `${base}/translime-discovery-${process.pid}-${Date.now()}`,
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name) => (
      name === 'userData' ? testUserDataDir : `${testUserDataDir}/temp`
    )),
  },
}));

vi.mock('@main/utils/useMainStore', () => ({
  default: {
    config: {
      get: vi.fn((key, defaultValue) => defaultValue),
    },
  },
}));

/**
 * 构造仅包含目录初始化所需成员的插件加载器替身。
 *
 * @returns {object} 可传给 `initPluginLoader` 的最小加载器对象。
 */
const createLoaderStub = () => ({
  pluginPackageDir: PLUGIN_PACKAGE_DIR,
  cleanTempNodeFiles: vi.fn(),
  setupNodeLoaderHack: vi.fn(),
});

describe('initPluginLoader', () => {
  beforeEach(() => {
    fs.rmSync(testUserDataDir, { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(testUserDataDir, { recursive: true, force: true });
  });

  it('userData 为空时创建插件目录与默认清单，不因父目录缺失而报错', () => {
    expect(fs.existsSync(testUserDataDir)).toBe(false);

    expect(() => initPluginLoader(createLoaderStub())).not.toThrow();

    expect(fs.existsSync(PLUGIN_DIR)).toBe(true);
    expect(fs.existsSync(PLUGIN_PACKAGE_DIR)).toBe(true);
    expect(fs.existsSync(PLUGIN_DIR_DEV)).toBe(true);
    expect(fs.existsSync(PLUGIN_MODULES_PATH_DEV)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(PLUGIN_JSON_PATH, 'utf8'));
    expect(manifest.name).toBe('translime-plugins');
    expect(manifest.dependencies).toEqual({});
  });

  it('重复初始化保留已有清单中的插件依赖', () => {
    fs.mkdirSync(PLUGIN_DIR, { recursive: true });
    const manifest = { dependencies: { 'translime-plugin-exist': '1.0.0' } };
    fs.writeFileSync(PLUGIN_JSON_PATH, JSON.stringify(manifest), 'utf8');

    initPluginLoader(createLoaderStub());
    initPluginLoader(createLoaderStub());

    expect(JSON.parse(fs.readFileSync(PLUGIN_JSON_PATH, 'utf8'))).toEqual(manifest);
  });
});
