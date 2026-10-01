import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  hashGameKey,
  listDirFiles,
  normalizeCustomDir,
  normalizeGameNameKey,
} from '../../src/utils/custom-dirs';

let tmpRoot;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-backup-custom-dirs-'));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('listDirFiles', () => {
  it('递归收集子目录内文件的相对路径（/ 分隔）', async () => {
    await fs.mkdir(path.join(tmpRoot, 'slot1', 'deep'), { recursive: true });
    await fs.writeFile(path.join(tmpRoot, 'config.ini'), 'x');
    await fs.writeFile(path.join(tmpRoot, 'slot1', 'save.dat'), 'x');
    await fs.writeFile(path.join(tmpRoot, 'slot1', 'deep', 'auto.sav'), 'x');

    const { files, truncated } = await listDirFiles(tmpRoot);

    expect(truncated).toBe(false);
    expect(files.sort()).toEqual([
      'config.ini',
      'slot1/deep/auto.sav',
      'slot1/save.dat',
    ]);
  });

  it('达到文件上限时停止收集并标记截断', async () => {
    await fs.writeFile(path.join(tmpRoot, 'a.dat'), 'x');
    await fs.writeFile(path.join(tmpRoot, 'b.dat'), 'x');
    await fs.writeFile(path.join(tmpRoot, 'c.dat'), 'x');

    const { files, truncated } = await listDirFiles(tmpRoot, { maxFiles: 2 });

    expect(truncated).toBe(true);
    expect(files).toHaveLength(2);
  });

  it('空目录返回空文件列表，不标记截断', async () => {
    const { files, truncated } = await listDirFiles(tmpRoot);

    expect(files).toEqual([]);
    expect(truncated).toBe(false);
  });

  it('目录不存在时返回空文件列表而不是抛错', async () => {
    const missing = path.join(tmpRoot, 'not-exist');

    const { files } = await listDirFiles(missing);

    expect(files).toEqual([]);
  });
});

describe('normalizeCustomDir', () => {
  it('解析为绝对路径，空白输入返回空字符串', () => {
    expect(normalizeCustomDir('  ')).toBe('');
    expect(normalizeCustomDir(undefined)).toBe('');

    const normalized = normalizeCustomDir(tmpRoot);
    expect(path.isAbsolute(normalized)).toBe(true);
  });

  it('同一目录的不同写法归一为相同键，用于去重', () => {
    const withDot = path.join(tmpRoot, 'sub', '..');
    const direct = path.join(tmpRoot);

    expect(normalizeCustomDir(withDot)).toBe(normalizeCustomDir(direct));
  });
});

describe('hashGameKey', () => {
  it('同一游戏名（含大小写/空白差异）生成稳定 ID，用于备份目录与排除列表', () => {
    expect(hashGameKey(' Hades ')).toBe(hashGameKey('hades'));
    expect(hashGameKey('Hades')).toMatch(/^custom-[0-9a-z]+$/);
  });

  it('不同游戏名生成不同 ID，且不与数字 Steam AppID 冲突', () => {
    expect(hashGameKey('Hades')).not.toBe(hashGameKey('Hollow Knight'));
    expect(hashGameKey('Hades')).not.toBe('1245620');
  });

  it('非字符串输入返回合法 ID 而不是抛错', () => {
    expect(hashGameKey(undefined)).toBe(hashGameKey(''));
    expect(hashGameKey('')).toMatch(/^custom-[0-9a-z]+$/);
  });
});

describe('normalizeGameNameKey', () => {
  it('按小写去空白匹配，用于把手动目录合并进同名扫描游戏', () => {
    expect(normalizeGameNameKey(' Hades ')).toBe('hades');
    expect(normalizeGameNameKey('HADES')).toBe(normalizeGameNameKey('hades'));
    expect(normalizeGameNameKey(undefined)).toBe('');
  });
});
