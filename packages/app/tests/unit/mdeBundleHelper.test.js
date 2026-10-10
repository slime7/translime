import {
  existsSync, readFileSync, rmSync, statSync,
} from 'node:fs';
import { resolve } from 'node:path';
import {
  afterAll, describe, expect, it,
} from 'vitest';
import {
  buildStandaloneMdeBundle,
  DEFAULT_MDE_ENTRY,
} from '../../src/main/utils/mdeBundleHelper';

describe('mdeBundleHelper', () => {
  const testCacheDir = resolve(import.meta.dirname, '../../node_modules/.cache/test-mde-bundle');
  const testOutputFile = resolve(testCacheDir, 'mde.test.esm.js');

  afterAll(() => {
    try {
      rmSync(testCacheDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  });

  it('成功生成自包含 MDE 运行时，内联 @material/material-color-utilities 且仅保留 vue 外部引用', async () => {
    const bundlePath = await buildStandaloneMdeBundle({
      entry: DEFAULT_MDE_ENTRY,
      cacheDir: testCacheDir,
      outputFile: testOutputFile,
      force: true,
    });

    expect(existsSync(bundlePath)).toBe(true);
    const content = readFileSync(bundlePath, 'utf8');

    // 验证包含核心导出
    expect(content).toContain('createMatUi');

    // 验证关键依赖已经被打入单文件，不再包含外部裸模块导入
    expect(content).not.toMatch(/from\s*['"]@material\/material-color-utilities['"]/);

    // 验证保持 vue 为 external
    expect(content).toMatch(/from\s*['"]vue['"]/);
  });

  it('当缓存有效时直接复用缓存文件避免重复构建', async () => {
    const firstMtime = statSync(testOutputFile).mtimeMs;

    const bundlePath = await buildStandaloneMdeBundle({
      entry: DEFAULT_MDE_ENTRY,
      cacheDir: testCacheDir,
      outputFile: testOutputFile,
      force: false,
    });

    expect(bundlePath).toBe(testOutputFile);
    const secondMtime = statSync(testOutputFile).mtimeMs;
    expect(secondMtime).toBe(firstMtime);
  });
});
