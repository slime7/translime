import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest';
import {
  deletePassthroughRemote,
  resolvePassthroughConflict,
  restorePassthroughEntry,
  runPassthroughSync,
} from '../../src/utils/passthrough/engine';
import { SyncCancelledError } from '../../src/utils/sync/engine';
import { buildEntryId, createMeta, markMetaDeleted } from '../../src/utils/passthrough/meta';

let tmpRoot;
let remoteRoot; // 模拟远端的 passthrough 根
let stageDir;
let target;

const ENTRY = { entryId: buildEntryId('Test Save'), name: 'Test Save' };

const localDirOf = () => path.join(tmpRoot, 'saves', ENTRY.entryId);
const remoteEntryOf = () => path.join(remoteRoot, ENTRY.entryId);

const writeLocalSave = async (name, content) => {
  const dir = localDirOf();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), content, 'utf8');
  return dir;
};

const writeRemoteSave = async (name, content) => {
  const dir = remoteEntryOf();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), content, 'utf8');
};

const writeRemoteMeta = async (meta) => {
  const dir = path.join(remoteEntryOf(), '.translime');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta), 'utf8');
};

const readLocalMeta = async () => {
  // 本地存档目录不应出现 .translime（meta 只存远端）
  const exists = await fs.stat(path.join(localDirOf(), '.translime')).catch(() => null);
  return Boolean(exists);
};

/**
 * 基于磁盘的模拟 rclone：实现直通同步用到的 copy（含 staging 的 --include 拉取）、
 * copyto、purge。--update 在模拟层退化为直接覆盖（rclone 的新旧判定本身是被信任的外部行为），
 * 但 .translime 排除语义必须模拟——它承担直通与备份的数据隔离。
 */
const makeFakeExec = () => {
  const REMOTE_PREFIX = 'fake-remote:saves';
  // 把 rclone 远端风格路径（remote:path/x）映射到磁盘上的模拟远端根的父目录：
  // 引擎会在 target 后自行拼接 passthrough/<entryId>，因此 target 对应 remoteRoot 的上一级
  const toPath = (p) => {
    const norm = String(p).replaceAll('\\', '/');
    if (norm === REMOTE_PREFIX || norm.startsWith(`${REMOTE_PREFIX}/`)) {
      const rel = norm.slice(REMOTE_PREFIX.length).replace(/^\//, '');
      return rel ? path.join(path.dirname(remoteRoot), ...rel.split('/')) : path.dirname(remoteRoot);
    }
    return norm.replaceAll('/', path.sep);
  };
  const stageMetaPull = async (baseDir) => {
    const walk = async (dir, rel) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      await Promise.all(entries.map(async (entry) => {
        const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(entryPath, entryRel);
          return;
        }
        // 只搬运 `<entryId>/.translime/meta.json`
        if (entryRel.split('/').length === 3 && entryRel.endsWith('.translime/meta.json')) {
          const dest = path.join(stageDir, entryRel);
          await fs.mkdir(path.dirname(dest), { recursive: true });
          await fs.copyFile(entryPath, dest);
        }
      }));
    };
    await walk(baseDir, '');
  };

  return async (args) => {
    const [cmd, src, dest] = args;
    if (cmd === 'copy' && args.includes('--include')) {
      // staging 拉取：只搬运 `<entryId>/.translime/meta.json`（对应 --include 通配）
      const srcPath = toPath(src);
      if (!(await fs.stat(srcPath).catch(() => null))) {
        return { code: 3, stdout: '', stderr: 'Directory not found.' };
      }
      await stageMetaPull(srcPath);
      return { code: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'copy') {
      const srcPath = toPath(src);
      if (!(await fs.stat(srcPath).catch(() => null))) {
        return { code: 3, stdout: '', stderr: 'Directory not found.' };
      }
      await fs.cp(srcPath, toPath(dest), {
        recursive: true,
        force: true,
        filter: (filePath) => !filePath.includes('.translime'),
      });
      return { code: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'copyto') {
      const srcPath = toPath(src);
      if (!(await fs.stat(srcPath).catch(() => null))) {
        return { code: 3, stdout: '', stderr: 'object not found' };
      }
      const destPath = toPath(dest);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
      return { code: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'purge') {
      const p = toPath(src);
      if (!(await fs.stat(p).catch(() => null))) {
        return { code: 3, stdout: '', stderr: 'Directory not found.' };
      }
      await fs.rm(p, { recursive: true, force: true });
      return { code: 0, stdout: '', stderr: '' };
    }
    throw new Error(`模拟 rclone 未实现的命令：${args.join(' ')}`);
  };
};

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pt-engine-test-'));
  remoteRoot = path.join(tmpRoot, 'remote', 'passthrough');
  stageDir = path.join(tmpRoot, 'stage');
  target = 'fake-remote:saves';
  await fs.mkdir(remoteRoot, { recursive: true });
  await fs.mkdir(stageDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('runPassthroughSync', () => {
  it('远端墓碑 + 本地无更新 → 自动删除本地目录并记入 appliedDeletions（删除传播端到端）', async () => {
    const dir = await writeLocalSave('save.dat', 'local');
    // 本地 mtime 是“现在”，晚于墓碑时间会被判冲突：把墓碑放在未来，保证判为可删除
    await writeRemoteMeta(markMetaDeleted(createMeta({
      ...ENTRY, machineId: 'other', at: '2099-01-01T00:00:00.000Z',
    }), { machineId: 'other', at: '2099-01-01T00:00:00.000Z' }));

    const exec = makeFakeExec();
    const deletions = [];
    const report = await runPassthroughSync({
      exec,
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
      stageDir,
      onEntry: (info) => {
        if (info.action === 'apply-deletion') {
          deletions.push(info.entry);
        }
      },
    });

    expect(await fs.stat(dir).catch(() => null)).toBe(null);
    expect(report.appliedDeletions).toEqual([{ entryId: ENTRY.entryId, name: ENTRY.name }]);
    expect(deletions).toEqual([{ ...ENTRY, dir }]);
    // 远端墓碑保持存在（防止其他端复活）
    expect(await fs.stat(path.join(remoteEntryOf(), '.translime', 'meta.json'))).toBeTruthy();
  });

  it('本地在远端删除之后仍有更新 → 转冲突且本地保留（不误删活跃存档）', async () => {
    const dir = await writeLocalSave('save.dat', 'local');
    await writeRemoteMeta(markMetaDeleted(createMeta({
      ...ENTRY, machineId: 'other', at: '2000-01-01T00:00:00.000Z',
    }), { machineId: 'other', at: '2000-01-01T00:00:00.000Z' }));

    const report = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
      stageDir,
    });

    expect(report.conflicts).toEqual([{
      entryId: ENTRY.entryId, name: ENTRY.name, detectedAt: expect.any(String),
    }]);
    expect(await fs.stat(path.join(dir, 'save.dat'))).toBeTruthy();
  });

  it('本地目录缺失且远端未删除 → 记为 local-missing 跳过，不自动回补', async () => {
    await writeRemoteSave('save.dat', 'remote');
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: '2026-10-01T10:00:00.000Z',
    }));
    const dir = localDirOf();

    const report = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
      stageDir,
    });

    expect(report.skipped).toEqual([{
      entryId: ENTRY.entryId, name: ENTRY.name, reason: 'local-missing',
    }]);
    expect(await fs.stat(dir).catch(() => null)).toBe(null);
  });

  it('两端都在 → 双向同步与 meta 更新（远端 meta 收尾写非删除标记），本地不落 .translime', async () => {
    const dir = await writeLocalSave('local.sav', 'local');
    await writeRemoteSave('remote.sav', 'remote');
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: '2026-10-01T10:00:00.000Z',
    }));

    const report = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
      stageDir,
    });

    expect(report.updated).toEqual([{ entryId: ENTRY.entryId, name: ENTRY.name }]);
    // 双向增量都发生：本地拿到远端文件，远端拿到本地文件
    expect(await fs.readFile(path.join(dir, 'remote.sav'), 'utf8')).toBe('remote');
    expect(await fs.readFile(path.join(remoteEntryOf(), 'local.sav'), 'utf8')).toBe('local');
    // meta 收尾且为非删除状态
    const remoteMeta = JSON.parse(
      await fs.readFile(path.join(remoteEntryOf(), '.translime', 'meta.json'), 'utf8'),
    );
    expect(remoteMeta.deleted).toBe(false);
    expect(remoteMeta.updatedBy).toBe('this-machine');
    // 隔离约定：同步不会把远端 meta 拷进本地存档目录
    expect(await readLocalMeta()).toBe(false);
  });

  it('远端尚无 passthrough 目录（退出码 3）视为空远端，首拉/首传不报错', async () => {
    await fs.rm(remoteRoot, { recursive: true, force: true });
    const dir = await writeLocalSave('save.dat', 'local');

    const report = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
      stageDir,
    });

    expect(report.ok).toBe(true);
    expect(report.updated).toEqual([{ entryId: ENTRY.entryId, name: ENTRY.name }]);
    expect(await fs.readFile(path.join(remoteEntryOf(), 'save.dat'), 'utf8')).toBe('local');
  });

  it('取消时抛出 SyncCancelledError（与备份对账共用取消语义）', async () => {
    const dir = await writeLocalSave('save.dat', 'local');

    await expect(runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
      stageDir,
      isCancelled: () => true,
    })).rejects.toThrow(SyncCancelledError);
  });
});

describe('deletePassthroughRemote', () => {
  it('purge 远端条目后写入墓碑 meta（deleted 标记齐全），向其他端传播删除意图', async () => {
    await writeRemoteSave('save.dat', 'remote');

    await deletePassthroughRemote(makeFakeExec(), target, {
      ...ENTRY,
      machineId: 'this-machine',
      tombstoneAt: '2026-10-02T10:00:00.000Z',
    });

    const files = await fs.readdir(remoteEntryOf(), { recursive: true });
    expect(files).toEqual(['.translime', path.join('.translime', 'meta.json')].map((p) => p.replaceAll('/', path.sep)));
    const meta = JSON.parse(
      await fs.readFile(path.join(remoteEntryOf(), '.translime', 'meta.json'), 'utf8'),
    );
    expect(meta.deleted).toBe(true);
    expect(meta.deletedAt).toBe('2026-10-02T10:00:00.000Z');
    expect(meta.deletedBy).toBe('this-machine');
    expect(meta.entryId).toBe(ENTRY.entryId);
  });

  it('远端条目不存在也照常写入墓碑（向其他端传播删除意图）', async () => {
    await deletePassthroughRemote(makeFakeExec(), target, {
      ...ENTRY,
      machineId: 'this-machine',
      tombstoneAt: '2026-10-02T10:00:00.000Z',
    });
    const meta = JSON.parse(
      await fs.readFile(path.join(remoteEntryOf(), '.translime', 'meta.json'), 'utf8'),
    );
    expect(meta.deleted).toBe(true);
  });
});

describe('restorePassthroughEntry', () => {
  it('本地目录缺失时整目录回补，且不把远端 meta 拷进本地', async () => {
    await writeRemoteSave('save.dat', 'remote');
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: '2026-10-01T10:00:00.000Z',
    }));
    const dir = localDirOf();

    await restorePassthroughEntry(makeFakeExec(), target, { entryId: ENTRY.entryId, dir });

    expect(await fs.readFile(path.join(dir, 'save.dat'), 'utf8')).toBe('remote');
    expect(await readLocalMeta()).toBe(false);
  });
});

describe('resolvePassthroughConflict', () => {
  it('keep-local：以本地为准撤销远端删除（数据回传 + meta 恢复非删除）', async () => {
    const dir = await writeLocalSave('save.dat', 'local');

    await resolvePassthroughConflict(makeFakeExec(), target, {
      ...ENTRY, dir, mode: 'keep-local', machineId: 'this-machine',
    });

    expect(await fs.readFile(path.join(remoteEntryOf(), 'save.dat'), 'utf8')).toBe('local');
    const meta = JSON.parse(
      await fs.readFile(path.join(remoteEntryOf(), '.translime', 'meta.json'), 'utf8'),
    );
    expect(meta.deleted).toBe(false);
  });

  it('confirm-deletion：移除本地目录，远端不动作', async () => {
    const dir = await writeLocalSave('save.dat', 'local');

    await resolvePassthroughConflict(makeFakeExec(), target, {
      ...ENTRY, dir, mode: 'confirm-deletion', machineId: 'this-machine',
    });

    expect(await fs.stat(dir).catch(() => null)).toBe(null);
  });

  it('未知处理方式直接报错', async () => {
    await expect(resolvePassthroughConflict(makeFakeExec(), target, {
      ...ENTRY, dir: localDirOf(), mode: 'nope', machineId: 'm',
    })).rejects.toThrow('未知的直通冲突处理方式');
  });
});
