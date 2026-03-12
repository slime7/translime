import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

import readPackageManifest from '@main/utils/readPackageManifest';

/** 创建临时测试目录 */
const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-test-'));

/** 递归删除目录 */
const removeTempDir = (dir) => fs.rmSync(dir, { recursive: true, force: true });

describe('readPackageManifest', () => {
  /** @type {string} */
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it('应该正确读取 package.json', () => {
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test-pkg', version: '1.0.0' }),
    );

    const result = readPackageManifest(tempDir);

    expect(result).toEqual({ name: 'test-pkg', version: '1.0.0' });
  });

  it('应该正确读取 package.json5', () => {
    // JSON5 支持注释和尾逗号
    fs.writeFileSync(
      path.join(tempDir, 'package.json5'),
      `{
        // 包名
        name: 'test-pkg-json5',
        version: '2.0.0',
      }`,
    );

    const result = readPackageManifest(tempDir);

    expect(result).toEqual({ name: 'test-pkg-json5', version: '2.0.0' });
  });

  it('应该正确读取 package.yaml', () => {
    fs.writeFileSync(
      path.join(tempDir, 'package.yaml'),
      'name: test-pkg-yaml\nversion: "3.0.0"\n',
    );

    const result = readPackageManifest(tempDir);

    expect(result).toEqual({ name: 'test-pkg-yaml', version: '3.0.0' });
  });

  it('package.json 优先级高于 package.json5 和 package.yaml', () => {
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'from-json' }),
    );
    fs.writeFileSync(
      path.join(tempDir, 'package.json5'),
      "{ name: 'from-json5' }",
    );
    fs.writeFileSync(
      path.join(tempDir, 'package.yaml'),
      'name: from-yaml\n',
    );

    const result = readPackageManifest(tempDir);

    expect(result.name).toBe('from-json');
  });

  it('package.json5 优先级高于 package.yaml', () => {
    fs.writeFileSync(
      path.join(tempDir, 'package.json5'),
      "{ name: 'from-json5' }",
    );
    fs.writeFileSync(
      path.join(tempDir, 'package.yaml'),
      'name: from-yaml\n',
    );

    const result = readPackageManifest(tempDir);

    expect(result.name).toBe('from-json5');
  });

  it('找不到任何包信息文件时应该抛出错误', () => {
    expect(() => readPackageManifest(tempDir)).toThrow(
      /未找到有效的包信息文件/,
    );
  });

  it('文件内容格式非法时应该抛出解析错误', () => {
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      '{ invalid json',
    );

    expect(() => readPackageManifest(tempDir)).toThrow();
  });
});
