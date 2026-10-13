import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  clearEntryCache,
} from '@main/core/plugin-loader/entryLoader';

/**
 * 入口加载器单测。
 *
 * ESM 加载语义必须在真实 Node 环境验证：vitest 的 vm 执行环境对
 * 动态 import 有额外限制（无 dynamic import 回调），而 ESM 热重载依赖的
 * 正是原生 ESM loader 的缓存行为（require.cache 删除不触发重新求值、
 * query 击穿才能拿到新模块）。因此 ESM 场景通过子进程加载真实的
 * entryLoader 模块执行；CJS 场景与导出提取在同进程直接验证。
 */

// vitest 以包根为 cwd 执行；entryLoader 只依赖 Node 内置模块，可被子进程直接 import
const entryLoaderAbsPath = path.resolve(
  process.cwd(),
  'src/main/core/plugin-loader/entryLoader.js',
);
const entryLoaderUrl = pathToFileURL(entryLoaderAbsPath).href;

const execNode = (script) => new Promise((resolve, reject) => {
  execFile(
    process.execPath,
    ['--input-type=module', '--eval', script],
    { timeout: 30000 },
    (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${err.message}\n${stderr}`));
        return;
      }
      resolve(stdout);
    },
  );
});

const writeEntry = (dir, version) => {
  const distDir = path.join(dir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(
    path.join(distDir, 'index.esm.js'),
    `export const version = '${version}';\n`
    + `export const pluginDidLoad = () => 'did-load-${version}';\n`
    + 'export default { pluginDidLoad, version };\n',
    'utf8',
  );
};

describe('entryLoader', () => {
  it('源码入口文件应存在（子进程导入锚点）', () => {
    expect(fs.existsSync(entryLoaderAbsPath)).toBe(true);
  });

  describe('loadPluginEntry: esm（真实 Node 子进程）', () => {
    it('ESM 入口产物变化后重新加载应拿到新导出（热重载语义）', async () => {
      const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'esm-entry-')));
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
      writeEntry(dir, 'v1');

      const stdout = await execNode(`
        import { loadPluginEntry } from ${JSON.stringify(entryLoaderUrl)};
        const plugin = {
          packageName: 'translime-plugin-entry-esm',
          pluginPath: ${JSON.stringify(dir)},
          exports: 'dist/index.esm.js',
          entryFormat: 'esm',
        };
        const first = await loadPluginEntry(plugin);
        console.log(JSON.stringify({ version: first.version, hasDidLoad: typeof first.pluginDidLoad }));
      `);

      expect(JSON.parse(stdout.trim())).toEqual({ version: 'v1', hasDidLoad: 'function' });

      // 产物变化后再次加载：防回归点是删除 require.cache 不会使 ESM 重新求值，
      // 必须由 query 击穿拿到新模块
      writeEntry(dir, 'v2');
      const stdout2 = await execNode(`
        import { loadPluginEntry } from ${JSON.stringify(entryLoaderUrl)};
        const plugin = {
          packageName: 'translime-plugin-entry-esm',
          pluginPath: ${JSON.stringify(dir)},
          exports: 'dist/index.esm.js',
          entryFormat: 'esm',
        };
        const second = await loadPluginEntry(plugin);
        console.log(JSON.stringify({ version: second.version }));
      `);

      expect(JSON.parse(stdout2.trim())).toEqual({ version: 'v2' });
    });

    it('default export 汇总应优先于命名导出（仓库约定的导出形态）', async () => {
      const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'esm-entry-')));
      const distDir = path.join(dir, 'dist');
      fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(
        path.join(distDir, 'index.esm.js'),
        "export const version = 'named';\n"
        + "export default { version: 'default', pluginDidLoad: () => 'ok' };\n",
        'utf8',
      );

      const stdout = await execNode(`
        import { loadPluginEntry } from ${JSON.stringify(entryLoaderUrl)};
        const plugin = {
          packageName: 'translime-plugin-entry-default',
          pluginPath: ${JSON.stringify(dir)},
          exports: 'dist/index.esm.js',
          entryFormat: 'esm',
        };
        const entry = await loadPluginEntry(plugin);
        console.log(JSON.stringify({ version: entry.version, didLoad: entry.pluginDidLoad() }));
      `);

      expect(JSON.parse(stdout.trim())).toEqual({ version: 'default', didLoad: 'ok' });
    });

    it('纯命名导出（无 default）的 ESM 入口也应可用', async () => {
      const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'esm-entry-')));
      const distDir = path.join(dir, 'dist');
      fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(
        path.join(distDir, 'index.esm.js'),
        "export const version = 'named-only';\n",
        'utf8',
      );

      const stdout = await execNode(`
        import { loadPluginEntry } from ${JSON.stringify(entryLoaderUrl)};
        const plugin = {
          packageName: 'translime-plugin-entry-named',
          pluginPath: ${JSON.stringify(dir)},
          exports: 'dist/index.esm.js',
          entryFormat: 'esm',
        };
        const entry = await loadPluginEntry(plugin);
        console.log(JSON.stringify({ version: entry.version }));
      `);

      expect(JSON.parse(stdout.trim())).toEqual({ version: 'named-only' });
    });

    it('入口产物缺失时应拒绝并保留原始错误', async () => {
      // 该分支只依赖路径解析，可在进程内验证
      const { loadPluginEntry } = await import('@main/core/plugin-loader/entryLoader');
      const plugin = {
        packageName: 'translime-plugin-entry-missing',
        pluginPath: path.join(os.tmpdir(), 'not-exists-plugin-dir'),
        exports: 'dist/index.esm.js',
        entryFormat: 'esm',
      };

      await expect(loadPluginEntry(plugin)).rejects.toThrow();
    });
  });

  describe('loadPluginEntry: cjs', () => {
    it('CJS 入口加载后清理缓存应能拿到新产物', async () => {
      const { loadPluginEntry } = await import('@main/core/plugin-loader/entryLoader');
      const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cjs-entry-')));
      const distDir = path.join(dir, 'dist');
      fs.mkdirSync(distDir, { recursive: true });
      const entryFile = path.join(distDir, 'index.cjs.js');
      fs.writeFileSync(entryFile, "module.exports = { version: 'v1' };\n", 'utf8');

      const plugin = {
        packageName: 'translime-plugin-entry-cjs',
        pluginPath: dir,
        exports: 'dist/index.cjs.js',
        entryFormat: 'cjs',
      };

      const first = await loadPluginEntry(plugin);
      expect(first.version).toBe('v1');

      fs.writeFileSync(entryFile, "module.exports = { version: 'v2' };\n", 'utf8');
      // 缓存未清理时拿到旧模块（既有 require 语义）
      const stale = await loadPluginEntry(plugin);
      expect(stale.version).toBe('v1');

      const cleared = clearEntryCache(plugin);
      expect(cleared).toBeGreaterThan(0);
      const fresh = await loadPluginEntry(plugin);
      expect(fresh.version).toBe('v2');
    });
  });

  describe('extractEntryExports', () => {
    it('对象形式的 default 应被提取，其余形态原样返回', async () => {
      const { extractEntryExports: extract } = await import('@main/core/plugin-loader/entryLoader');

      expect(extract({ default: { a: 1 } })).toEqual({ a: 1 });
      const ns = { a: 1 };
      expect(extract(ns)).toBe(ns);
      expect(extract({ default: null, a: 1 })).toEqual({ default: null, a: 1 });
      // 数组不是有效的插件导出聚合，不做提取
      expect(extract({ default: [1, 2], a: 1 })).toEqual({ default: [1, 2], a: 1 });
    });
  });

  describe('clearEntryCache', () => {
    it('应只清理目标插件目录内的缓存条目', async () => {
      const { createRequire } = await import('node:module');
      const nodeRequire = createRequire(import.meta.url);

      const dirA = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cache-a-')));
      const dirB = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cache-b-')));
      fs.writeFileSync(path.join(dirA, 'entry.cjs'), 'module.exports = { dir: "a" };\n', 'utf8');
      fs.writeFileSync(path.join(dirB, 'entry.cjs'), 'module.exports = { dir: "b" };\n', 'utf8');
      const entryA = nodeRequire(path.join(dirA, 'entry.cjs'));
      const entryB = nodeRequire(path.join(dirB, 'entry.cjs'));

      const cleanedA = clearEntryCache({ packageName: path.basename(dirA), pluginPath: dirA });
      expect(cleanedA).toBeGreaterThan(0);

      // A 清理后重新加载拿到新模块对象；B 的缓存不受影响（同一对象命中缓存）
      fs.writeFileSync(path.join(dirA, 'entry.cjs'), 'module.exports = { dir: "a2" };\n', 'utf8');
      expect(nodeRequire(path.join(dirA, 'entry.cjs')).dir).toBe('a2');
      expect(nodeRequire(path.join(dirB, 'entry.cjs'))).toBe(entryB);
      expect(entryB.dir).toBe('b');
      expect(entryA.dir).toBe('a');
    });
  });
});
