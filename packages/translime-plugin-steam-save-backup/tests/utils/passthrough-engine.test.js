import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest';
import {
  collectLocalState,
  deletePassthroughRemote,
  resolvePassthroughConflict,
  restorePassthroughEntry,
  runPassthroughSync,
} from '../../src/utils/passthrough/engine';
import { SyncCancelledError } from '../../src/utils/sync/engine';
import { buildEntryId, createMeta, markMetaDeleted } from '../../src/utils/passthrough/meta';
import {
  createPassthroughFakeExec,
  readRemoteZipEntry as readZipEntryAt,
  writeRemoteZip as writeZipAt,
} from './passthrough-fake-exec';

let tmpRoot;
let remoteRoot; // 模拟远端的 passthrough 根
let target;

const ENTRY = { entryId: buildEntryId('Test Save'), name: 'Test Save' };
const T0 = '2026-10-01T10:00:00.000Z';
const T1 = '2026-10-02T10:00:00.000Z';
const T1_MS = Date.parse(T1);
const OLD = '2026-09-01T00:00:00.000Z';

const localDirOf = () => path.join(tmpRoot, 'saves', ENTRY.entryId);
const remoteEntryOf = () => path.join(remoteRoot, ENTRY.entryId);

const writeLocalSave = async (name, content) => {
  const dir = localDirOf();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), content, 'utf8');
  return dir;
};

// 写入远端散文件
const writeLegacyRemoteFiles = async (name, content) => {
  const dir = remoteEntryOf();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), content, 'utf8');
};

const writeRemoteZip = (files) => writeZipAt(remoteEntryOf(), files);

const readRemoteZipEntry = (name) => readZipEntryAt(remoteEntryOf(), name);

const writeRemoteMeta = async (meta) => {
  await fs.mkdir(remoteEntryOf(), { recursive: true });
  await fs.writeFile(path.join(remoteEntryOf(), 'meta.json'), JSON.stringify(meta), 'utf8');
};

const readRemoteMeta = async () => JSON.parse(
  await fs.readFile(path.join(remoteEntryOf(), 'meta.json'), 'utf8'),
);

const setLocalMtime = async (name, iso) => {
  const time = new Date(iso);
  await fs.utimes(path.join(localDirOf(), name), time, time);
};

const readLocalMeta = async () => {
  // 本地存档目录不应出现引擎 meta（meta 只存远端条目根）
  const exists = await fs.stat(path.join(localDirOf(), 'meta.json')).catch(() => null);
  return Boolean(exists);
};

const makeFakeExec = () => createPassthroughFakeExec({ target, remoteRoot });

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pt-engine-test-'));
  remoteRoot = path.join(tmpRoot, 'remote', 'passthrough');
  target = 'fake-remote:saves';
  await fs.mkdir(remoteRoot, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('runPassthroughSync 删除传播', () => {
  it('远端墓碑 + 本地无更新 → 自动删除本地目录并记入 appliedDeletions', async () => {
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
    expect(await fs.stat(path.join(remoteEntryOf(), 'meta.json'))).toBeTruthy();
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
    });

    expect(report.conflicts).toEqual([{
      entryId: ENTRY.entryId, name: ENTRY.name, kind: 'deletion', detectedAt: expect.any(String),
    }]);
    expect(await fs.stat(path.join(dir, 'save.dat'))).toBeTruthy();
  });

  it('本地目录缺失且远端未删除 → 记为 local-missing 跳过，不自动回补', async () => {
    await writeRemoteZip({ 'save.dat': 'remote' });
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: T1,
    }));
    const dir = localDirOf();

    const report = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
    });

    expect(report.skipped).toEqual([{
      entryId: ENTRY.entryId, name: ENTRY.name, reason: 'local-missing',
    }]);
    expect(await fs.stat(dir).catch(() => null)).toBe(null);
  });
});

describe('runPassthroughSync 快照同步（数据包 + 水位）', () => {
  it('基线未知且本地较新 → 打包上传：远端出现 data.zip 与收尾 meta，本地目录不被改动', async () => {
    const dir = await writeLocalSave('local.sav', 'local');
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: T0,
    }));

    const report = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
    });

    expect(report.updated).toEqual([{ entryId: ENTRY.entryId, name: ENTRY.name }]);
    // 本地内容进入远端数据包
    expect(await readRemoteZipEntry('local.sav')).toBe('local');
    expect(await fs.stat(path.join(remoteEntryOf(), 'local.sav')).catch(() => null)).toBe(null);
    // meta 收尾且为非删除状态，水位 = meta 的 updatedAt
    const meta = await readRemoteMeta();
    expect(meta.deleted).toBe(false);
    expect(meta.updatedBy).toBe('this-machine');
    expect(report.watermarks[ENTRY.entryId]).toBe(meta.updatedAt);
    // 上传不改动本地目录
    expect(await fs.readFile(path.join(dir, 'local.sav'), 'utf8')).toBe('local');
  });

  it('远端尚无 passthrough 目录（退出码 3）视为空远端，首传建立数据包条目', async () => {
    await fs.rm(remoteRoot, { recursive: true, force: true });
    const dir = await writeLocalSave('save.dat', 'local');

    const report = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
    });

    expect(report.ok).toBe(true);
    expect(report.updated).toEqual([{ entryId: ENTRY.entryId, name: ENTRY.name }]);
    expect(await readRemoteZipEntry('save.dat')).toBe('local');
  });

  it('基线未知且远端较新 → 下载数据包解压：本地拿到远端文件并盖水位 mtime', async () => {
    const dir = await writeLocalSave('local.sav', 'local');
    await setLocalMtime('local.sav', OLD);
    await writeRemoteZip({ 'remote.sav': 'remote' });
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: T1,
    }));

    const report = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
    });

    expect(report.updated).toEqual([{ entryId: ENTRY.entryId, name: ENTRY.name }]);
    expect(await fs.readFile(path.join(dir, 'remote.sav'), 'utf8')).toBe('remote');
    // 水位 mtime：解压文件统一盖远端 updatedAt，跨时区拉取后不会被误判为本地有更新
    expect((await fs.stat(path.join(dir, 'remote.sav'))).mtimeMs).toBe(T1_MS);
    expect(report.watermarks[ENTRY.entryId]).toBe(T1);
    // 引擎 meta 不落本地
    expect(await readLocalMeta()).toBe(false);
    // 远端数据包保持原样（下载方向不回写远端）
    expect(await readRemoteZipEntry('remote.sav')).toBe('remote');
  });

  it('远端快照已删除的文件 → 下载替换后本地残留被清掉，且不残留备份目录', async () => {
    const dir = localDirOf();
    await fs.mkdir(path.join(dir, 'gone-dir'), { recursive: true });
    await fs.writeFile(path.join(dir, 'keep.sav'), 'remote-v1', 'utf8');
    await fs.writeFile(path.join(dir, 'gone.sav'), 'stale', 'utf8');
    await fs.writeFile(path.join(dir, 'gone-dir', 'deep.sav'), 'stale', 'utf8');
    await setLocalMtime('keep.sav', OLD);
    await setLocalMtime('gone.sav', OLD);
    await setLocalMtime(path.join('gone-dir', 'deep.sav'), OLD);
    await writeRemoteZip({ 'keep.sav': 'remote-v2', 'new.sav': 'brand-new' });
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: T1,
    }));

    const { manifest } = await collectLocalState(dir);
    const report = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
      watermarks: { [ENTRY.entryId]: T0 },
      manifests: { [ENTRY.entryId]: manifest },
    });

    expect(report.updated).toEqual([{ entryId: ENTRY.entryId, name: ENTRY.name }]);
    // 本地目录快照替换：远端已删除的文件被清理
    expect((await fs.readdir(dir)).sort()).toEqual(['keep.sav', 'new.sav']);
    expect(await fs.readFile(path.join(dir, 'keep.sav'), 'utf8')).toBe('remote-v2');
    expect(await fs.stat(path.join(dir, 'gone.sav')).catch(() => null)).toBe(null);
    expect(await fs.stat(path.join(dir, 'gone-dir')).catch(() => null)).toBe(null);
    expect((await fs.stat(path.join(dir, 'keep.sav'))).mtimeMs).toBe(T1_MS);
    // 旧存档备份确认无误后已丢弃，存档父目录不留临时目录
    expect(await fs.readdir(path.dirname(dir))).toEqual([ENTRY.entryId]);
  });

  it('远端数据包损坏解压失败 → 回滚旧存档（内容与 mtime 原样），记入 errors 且水位不变', async () => {
    const dir = await writeLocalSave('save.dat', 'local-v1');
    await setLocalMtime('save.dat', OLD);
    await fs.mkdir(remoteEntryOf(), { recursive: true });
    await fs.writeFile(path.join(remoteEntryOf(), 'data.zip'), 'definitely not a zip', 'utf8');
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: T1,
    }));

    const { manifest } = await collectLocalState(dir);
    const report = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
      watermarks: { [ENTRY.entryId]: T0 },
      manifests: { [ENTRY.entryId]: manifest },
    });

    expect(report.errors).toEqual([{
      entryId: ENTRY.entryId, name: ENTRY.name, message: expect.any(String),
    }]);
    expect(report.updated).toEqual([]);
    expect(report.watermarks).toEqual({});
    // 本地保持旧快照不变，不留下新旧混杂的半成品
    expect(await fs.readFile(path.join(dir, 'save.dat'), 'utf8')).toBe('local-v1');
    expect((await fs.stat(path.join(dir, 'save.dat'))).mtimeMs).toBe(Date.parse(OLD));
    expect((await fs.readdir(dir)).sort()).toEqual(['save.dat']);
    expect(await fs.readdir(path.dirname(dir))).toEqual([ENTRY.entryId]);
  });

  it('水位与清单基线生效后，两端无变化 → noop 跳过传输（稳态零流量）', async () => {
    // 防止回归：清单基线缺失会把“无变化的本地”误判为有变化，每轮整包重传
    const dir = await writeLocalSave('save.dat', 'stable');
    await setLocalMtime('save.dat', OLD);
    await writeRemoteZip({ 'save.dat': 'stable' });
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: T1,
    }));

    const first = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
    });
    expect(first.updated).toEqual([{ entryId: ENTRY.entryId, name: ENTRY.name }]);

    const commands = [];
    const baseExec = makeFakeExec();
    const exec = async (args) => {
      commands.push(args[0]);
      return baseExec(args);
    };
    const report = await runPassthroughSync({
      exec,
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
      watermarks: first.watermarks,
      manifests: first.manifests,
    });

    expect(report.skipped).toEqual([{
      entryId: ENTRY.entryId, name: ENTRY.name, reason: 'noop',
    }]);
    expect(report.updated).toEqual([]);
    expect(report.watermarks).toEqual({});
    expect(commands.filter((cmd) => cmd !== 'copy' && cmd !== 'lsf')).toEqual([]);
    const meta = await readRemoteMeta();
    expect(meta.updatedAt).toBe(T1);
  });

  it('清单比对发现本地修改 → 上传（mtime 盲区之外的内容差异不漏检）', async () => {
    const dir = await writeLocalSave('save.dat', 'v1');
    const first = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
    });

    // 游戏覆盖写档：内容与 mtime 都变，清单 mtime:size 随之不同
    await fs.writeFile(path.join(dir, 'save.dat'), 'v2-longer-content', 'utf8');
    await setLocalMtime('save.dat', '2026-10-03T00:00:00.000Z');

    const report = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
      watermarks: first.watermarks,
      manifests: first.manifests,
    });

    expect(report.updated).toEqual([{ entryId: ENTRY.entryId, name: ENTRY.name }]);
    expect(await readRemoteZipEntry('save.dat')).toBe('v2-longer-content');
  });

  it('复制改名保留旧 mtime 的存档栏位 → 清单比对发现并上传（不会被远端快照清掉）', async () => {
    // 防止回归：资源管理器复制/改名保留源文件旧 mtime，水位 mtime 判定是盲区，
    // 条目级快照下漏检的内容会在下次下载替换时被清掉
    const dir = await writeLocalSave('slot01', 'v1');
    const first = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
    });

    await fs.copyFile(path.join(dir, 'slot01'), path.join(dir, 'slot05'));
    await setLocalMtime('slot05', OLD);

    const report = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
      watermarks: first.watermarks,
      manifests: first.manifests,
    });

    expect(report.updated).toEqual([{ entryId: ENTRY.entryId, name: ENTRY.name }]);
    expect(await readRemoteZipEntry('slot05')).toBe('v1');
    expect(await fs.stat(path.join(dir, 'slot05'))).toBeTruthy();
  });

  it('双端都有更新（有共同基线）→ 转内容冲突待用户选择，不做静默传输', async () => {
    // 防止回归：双端均有更新时未进行冲突确认导致覆盖新文件
    const dir = await writeLocalSave('save.dat', 'local');
    const first = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
    });

    // 两端各自更新：本机覆盖写档，另一台设备上传新版本
    await fs.writeFile(path.join(dir, 'save.dat'), 'local-v2', 'utf8');
    await setLocalMtime('save.dat', '2026-10-03T00:00:00.000Z');
    const T2 = '2099-01-01T00:00:00.000Z';
    await writeRemoteZip({ 'save.dat': 'remote-v2' });
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: T2,
    }));

    const commands = [];
    const baseExec = makeFakeExec();
    const exec = async (args) => {
      commands.push(args[0]);
      return baseExec(args);
    };
    const report = await runPassthroughSync({
      exec,
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
      watermarks: first.watermarks,
      manifests: first.manifests,
    });

    expect(report.conflicts).toEqual([{
      entryId: ENTRY.entryId,
      name: ENTRY.name,
      kind: 'content',
      localUpdatedAt: '2026-10-03T00:00:00.000Z',
      remoteUpdatedAt: T2,
      remoteUpdatedBy: 'other',
      detectedAt: expect.any(String),
    }]);
    expect(report.updated).toEqual([]);
    expect(report.watermarks).toEqual({});
    // 冲突条目不发生任何传输（stage 元数据拉取与远端列举除外）
    expect(commands.filter((cmd) => cmd !== 'copy' && cmd !== 'lsf')).toEqual([]);
    // 双端数据原样保留，等待用户选择
    expect(await fs.readFile(path.join(dir, 'save.dat'), 'utf8')).toBe('local-v2');
    expect(await readRemoteZipEntry('save.dat')).toBe('remote-v2');
  });

  it('水位后远端有更新而本地无变化 → 只下载数据包，远端 meta 不被改写', async () => {
    const dir = await writeLocalSave('save.dat', 'local');
    const first = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
    });

    // 另一台设备上传了新版本（updatedAt 前进到未来，晚于首轮水位）
    await writeRemoteZip({ 'save.dat': 'remote-v2' });
    const T2 = '2099-01-01T00:00:00.000Z';
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: T2,
    }));

    const report = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
      watermarks: first.watermarks,
      manifests: first.manifests,
    });

    expect(report.updated).toEqual([{ entryId: ENTRY.entryId, name: ENTRY.name }]);
    expect(await fs.readFile(path.join(dir, 'save.dat'), 'utf8')).toBe('remote-v2');
    expect(report.watermarks[ENTRY.entryId]).toBe(T2);
    const meta = await readRemoteMeta();
    expect(meta.updatedAt).toBe(T2);
    expect(meta.updatedBy).toBe('other');
  });

  it('远端仅有散文件且无数据包 → 判下载但无数据包时以上传自愈重建远端并清理残留', async () => {
    const dir = await writeLocalSave('save.dat', 'local');
    await setLocalMtime('save.dat', OLD);
    await writeLegacyRemoteFiles('save.dat', 'legacy-mirror');
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: T1,
    }));

    const report = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
      watermarks: { [ENTRY.entryId]: T0 },
    });

    expect(report.updated).toEqual([{ entryId: ENTRY.entryId, name: ENTRY.name }]);
    // 远端重建为数据包布局：只剩 data.zip 与 meta.json，散文件残留清理
    const remaining = await fs.readdir(remoteEntryOf());
    expect(remaining.sort()).toEqual(['data.zip', 'meta.json']);
    expect(await readRemoteZipEntry('save.dat')).toBe('local');
  });

  it('残留条目按形态清理：散文件走 deletefile、散目录走 purge', async () => {
    const dir = await writeLocalSave('save.dat', 'local');
    await setLocalMtime('save.dat', OLD);
    await writeLegacyRemoteFiles('legacy.sav', 'legacy');
    await fs.mkdir(path.join(remoteEntryOf(), 'legacy-dir'), { recursive: true });
    await fs.writeFile(path.join(remoteEntryOf(), 'legacy-dir', 'inner.sav'), 'legacy', 'utf8');
    await writeRemoteZip({ 'save.dat': 'remote-v2' });
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: T1,
    }));

    const commands = [];
    const baseExec = makeFakeExec();
    const exec = async (args) => {
      if (args[0] === 'purge' || args[0] === 'deletefile') {
        commands.push(args);
      }
      return baseExec(args);
    };

    const report = await runPassthroughSync({
      exec,
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
    });

    // 基线未知且本地较旧 → 下载替换；随后按形态清理残留
    expect(report.updated).toEqual([{ entryId: ENTRY.entryId, name: ENTRY.name }]);
    expect(commands.some((args) => args[0] === 'purge' && args[1].endsWith('/legacy-dir'))).toBe(true);
    expect(commands.some((args) => args[0] === 'deletefile' && args[1].endsWith('/legacy.sav'))).toBe(true);
    expect((await fs.readdir(remoteEntryOf())).sort()).toEqual(['data.zip', 'meta.json']);
    expect(await fs.readFile(path.join(dir, 'save.dat'), 'utf8')).toBe('remote-v2');
  });

  it('残留清理失败只记错误，不推翻已完成的同步与水位（下轮对账重试清理）', async () => {
    // 防止回归：残留条目清理失败导致已完成同步的水位丢失
    const dir = await writeLocalSave('save.dat', 'local');
    await setLocalMtime('save.dat', OLD);
    await writeLegacyRemoteFiles('legacy.sav', 'legacy');
    await writeRemoteZip({ 'save.dat': 'remote-v2' });
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: T1,
    }));

    const baseExec = makeFakeExec();
    const exec = async (args) => {
      if (args[0] === 'deletefile') {
        return { code: 1, stdout: '', stderr: 'is a file not a directory' };
      }
      return baseExec(args);
    };

    const report = await runPassthroughSync({
      exec,
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
    });

    expect(report.updated).toEqual([{ entryId: ENTRY.entryId, name: ENTRY.name }]);
    expect(report.errors).toEqual([{
      entryId: ENTRY.entryId, name: ENTRY.name, message: expect.stringContaining('清理远端旧形态存档失败'),
    }]);
    // 同步结果与水位照常落定，本地拿到远端快照
    expect(report.watermarks[ENTRY.entryId]).toBe(T1);
    expect(await fs.readFile(path.join(dir, 'save.dat'), 'utf8')).toBe('remote-v2');
    // 残留保留待下轮重试
    expect(await fs.stat(path.join(remoteEntryOf(), 'legacy.sav'))).toBeTruthy();
  });

  it('远端仅剩 meta 空壳（无数据包）→ 以上传自愈重建远端', async () => {
    const dir = await writeLocalSave('save.dat', 'local');
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: T1,
    }));

    const report = await runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
      watermarks: { [ENTRY.entryId]: T0 },
    });

    expect(report.updated).toEqual([{ entryId: ENTRY.entryId, name: ENTRY.name }]);
    expect(await readRemoteZipEntry('save.dat')).toBe('local');
  });

  it('取消时抛出 SyncCancelledError（与备份对账共用取消语义）', async () => {
    const dir = await writeLocalSave('save.dat', 'local');

    await expect(runPassthroughSync({
      exec: makeFakeExec(),
      target,
      entries: [{ ...ENTRY, dir }],
      machineId: 'this-machine',
      isCancelled: () => true,
    })).rejects.toThrow(SyncCancelledError);
  });
});

describe('deletePassthroughRemote', () => {
  it('purge 远端条目后写入墓碑 meta（deleted 标记齐全），向其他端传播删除意图', async () => {
    await writeRemoteZip({ 'save.dat': 'remote' });

    await deletePassthroughRemote(makeFakeExec(), target, {
      ...ENTRY,
      machineId: 'this-machine',
      tombstoneAt: '2026-10-02T10:00:00.000Z',
    });

    const files = await fs.readdir(remoteEntryOf());
    expect(files).toEqual(['meta.json']);
    const meta = JSON.parse(
      await fs.readFile(path.join(remoteEntryOf(), 'meta.json'), 'utf8'),
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
      await fs.readFile(path.join(remoteEntryOf(), 'meta.json'), 'utf8'),
    );
    expect(meta.deleted).toBe(true);
  });
});

describe('restorePassthroughEntry', () => {
  it('数据包形态回补：解压远端 data.zip，返回 meta 时间作水位', async () => {
    await writeRemoteZip({ 'save.dat': 'remote' });
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: T1,
    }));
    const dir = localDirOf();

    const result = await restorePassthroughEntry(makeFakeExec(), target, { entryId: ENTRY.entryId, dir });

    expect(await fs.readFile(path.join(dir, 'save.dat'), 'utf8')).toBe('remote');
    expect(result.updatedAt).toBe(T1);
    expect((await fs.stat(path.join(dir, 'save.dat'))).mtimeMs).toBe(T1_MS);
    expect(await readLocalMeta()).toBe(false);
  });

  it('恢复下载同样走快照替换：本地旧残留被远端快照清除', async () => {
    const dir = localDirOf();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'stale.sav'), 'stale', 'utf8');
    await writeRemoteZip({ 'save.dat': 'remote' });
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: T1,
    }));

    const result = await restorePassthroughEntry(makeFakeExec(), target, { entryId: ENTRY.entryId, dir });

    expect(result.updatedAt).toBe(T1);
    expect(await fs.readdir(dir)).toEqual(['save.dat']);
    expect(await fs.readFile(path.join(dir, 'save.dat'), 'utf8')).toBe('remote');
    expect(await fs.readdir(path.dirname(dir))).toEqual([ENTRY.entryId]);
  });

  it('远端没有数据包（仅 meta 空壳）时不动作，不返回水位', async () => {
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: T1,
    }));
    const dir = localDirOf();

    const result = await restorePassthroughEntry(makeFakeExec(), target, { entryId: ENTRY.entryId, dir });

    expect(result.updatedAt).toBe(null);
    const files = await fs.readdir(dir);
    expect(files).toEqual([]);
  });
});

describe('resolvePassthroughConflict', () => {
  it('keep-local：以本地为准撤销远端删除（数据包上传 + meta 恢复非删除，返回新水位时间）', async () => {
    const dir = await writeLocalSave('save.dat', 'local');

    const result = await resolvePassthroughConflict(makeFakeExec(), target, {
      ...ENTRY, dir, mode: 'keep-local', machineId: 'this-machine',
    });

    expect(await readRemoteZipEntry('save.dat')).toBe('local');
    const meta = await readRemoteMeta();
    expect(meta.deleted).toBe(false);
    expect(result.updatedAt).toBe(meta.updatedAt);
  });

  it('use-remote：以远端为准快照替换本机目录，返回水位与清单供服务层落状态', async () => {
    const dir = await writeLocalSave('local.sav', 'local');
    await writeRemoteZip({ 'remote.sav': 'remote' });
    await writeRemoteMeta(createMeta({
      ...ENTRY, machineId: 'other', at: T1,
    }));

    const result = await resolvePassthroughConflict(makeFakeExec(), target, {
      ...ENTRY, dir, mode: 'use-remote', machineId: 'this-machine',
    });

    expect(result.mode).toBe('use-remote');
    expect(result.updatedAt).toBe(T1);
    expect(result.manifest).toEqual({ 'remote.sav': expect.any(String) });
    expect(await fs.readFile(path.join(dir, 'remote.sav'), 'utf8')).toBe('remote');
    expect(await fs.stat(path.join(dir, 'local.sav')).catch(() => null)).toBe(null);
    expect((await fs.stat(path.join(dir, 'remote.sav'))).mtimeMs).toBe(T1_MS);
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
