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
import discoverRemoteEntries from '../../src/utils/passthrough/discover';

let tmpRoot;
let remoteRoot;
let target;
let stageDir;

const writeMeta = async (entryId, meta) => {
  const dir = path.join(remoteRoot, 'passthrough', entryId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta), 'utf8');
};

// 模拟 rclone copy <target>/passthrough <stage> --include */meta.json：
// 只把远端 `<entryId>/meta.json` 复制进调用参数给定的 stage 目录
const makeFakeExec = () => async (args) => {
  const [cmd, src, dest] = args;
  const passthroughRoot = `${target}/passthrough`;
  if (cmd === 'copy' && src === passthroughRoot) {
    const root = path.join(remoteRoot, 'passthrough');
    if (!(await fs.stat(root).catch(() => null))) {
      return { code: 3, stdout: '', stderr: 'Directory not found.' };
    }
    const walk = async (dir, rel) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      await Promise.all(entries.map(async (entry) => {
        const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(entryPath, entryRel);
          return;
        }
        const parts = entryRel.split('/');
        if (parts.length === 2 && parts[1] === 'meta.json') {
          const destPath = path.join(dest, ...parts);
          await fs.mkdir(path.dirname(destPath), { recursive: true });
          await fs.copyFile(entryPath, destPath);
        }
      }));
    };
    await walk(root, '');
    return { code: 0, stdout: '', stderr: '' };
  }
  return { code: 1, stdout: '', stderr: `unexpected command: ${args.join(' ')}` };
};

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'translime-pt-discover-test-'));
  remoteRoot = path.join(tmpRoot, 'remote');
  stageDir = path.join(tmpRoot, 'stage');
  target = 'mock-remote:SteamBackups';
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('discoverRemoteEntries', () => {
  it('返回远端条目概览并按最近更新时间倒序', async () => {
    await writeMeta('custom-1abcd23', {
      schemaVersion: 1, entryId: 'custom-1abcd23', name: '空洞骑士', updatedAt: '2026-10-01T09:00:00.000Z', updatedBy: 'aaaa1111', deleted: false,
    });
    await writeMeta('custom-9zzz88', {
      schemaVersion: 1, entryId: 'custom-9zzz88', name: '星露谷物语', updatedAt: '2026-09-28T20:00:00.000Z', updatedBy: 'bbbb2222', deleted: false,
    });

    const entries = await discoverRemoteEntries({
      exec: makeFakeExec(),
      target,
      stageDir,
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      entryId: 'custom-1abcd23',
      name: '空洞骑士',
      updatedAt: '2026-10-01T09:00:00.000Z',
      updatedBy: 'aaaa1111',
    });
    expect(entries[1].name).toBe('星露谷物语');
  });

  it('跳过删除墓碑与解析失败的 meta', async () => {
    await writeMeta('custom-1abcd23', {
      schemaVersion: 1, entryId: 'custom-1abcd23', name: '空洞骑士', updatedAt: '2026-10-01T09:00:00.000Z', updatedBy: 'aaaa1111', deleted: false,
    });
    // 墓碑：已删除的条目不算可发现条目
    await writeMeta('custom-tomb00', {
      schemaVersion: 1, entryId: 'custom-tomb00', name: '已删除存档', updatedAt: '2026-09-30T08:00:00.000Z', updatedBy: 'aaaa1111', deleted: true, deletedAt: '2026-10-02T00:00:00.000Z',
    });
    // 传输中断残留：meta.json 无法解析
    const brokenDir = path.join(remoteRoot, 'passthrough', 'custom-broken0');
    await fs.mkdir(brokenDir, { recursive: true });
    await fs.writeFile(path.join(brokenDir, 'meta.json'), '{broken json', 'utf8');

    const entries = await discoverRemoteEntries({
      exec: makeFakeExec(),
      target,
      stageDir,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].entryId).toBe('custom-1abcd23');
  });

  it('远端没有 passthrough 目录（rclone 退出码 3）时返回空列表', async () => {
    const entries = await discoverRemoteEntries({
      exec: makeFakeExec(),
      target,
      stageDir,
    });

    expect(entries).toEqual([]);
  });

  it('远端读取失败时抛出错误', async () => {
    const failingExec = async () => ({ code: 1, stdout: '', stderr: 'connection refused' });

    await expect(discoverRemoteEntries({ exec: failingExec, target, stageDir }))
      .rejects.toThrow('读取直通远端元数据失败');
  });

  it('meta 缺少 name 时回退为 entryId', async () => {
    await writeMeta('custom-noname0', {
      schemaVersion: 1, entryId: 'custom-noname0', updatedAt: '2026-10-01T09:00:00.000Z', updatedBy: 'aaaa1111', deleted: false,
    });

    const entries = await discoverRemoteEntries({
      exec: makeFakeExec(),
      target,
      stageDir,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('custom-noname0');
  });

  it('未提供 stageDir 时使用临时目录并清理', async () => {
    await writeMeta('custom-1abcd23', {
      schemaVersion: 1, entryId: 'custom-1abcd23', name: '空洞骑士', updatedAt: '2026-10-01T09:00:00.000Z', updatedBy: 'aaaa1111', deleted: false,
    });

    const entries = await discoverRemoteEntries({ exec: makeFakeExec(), target });

    expect(entries).toHaveLength(1);
  });
});
