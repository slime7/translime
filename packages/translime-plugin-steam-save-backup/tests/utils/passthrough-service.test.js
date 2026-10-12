import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import createPassthroughService from '../../src/utils/passthrough/service';
import { buildEntryId, createMeta, markMetaDeleted } from '../../src/utils/passthrough/meta';
import {
  createPassthroughFakeExec,
  readRemoteZipEntry,
  writeRemoteZip,
} from './passthrough-fake-exec';

// mock 掉 rclone 进程创建：restoreEntry / resolveConflict 走 prepareExec 自建 exec
// （带 killAll），运行期把调用转发到当前用例的磁盘 fake（runSync 由测试直接传入 exec）
const { fakeExecRef } = vi.hoisted(() => ({
  fakeExecRef: { current: null },
}));
vi.mock('../../src/utils/sync/rclone', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createExec: vi.fn(() => {
      const exec = async (args, options) => fakeExecRef.current(args, options);
      exec.killAll = vi.fn();
      return exec;
    }),
  };
});

const PLUGIN_ID = 'translime-plugin-steam-save-backup';
const ENTRY_NAME = 'Test Save';
const ENTRY_ID = buildEntryId(ENTRY_NAME);
const TARGET = 'fake-remote:saves';
const T0 = '2026-10-01T10:00:00.000Z';
const T1 = '2026-10-02T10:00:00.000Z';

let tmpRoot;
let remoteRoot;
let stageDir;
let localDir;
let configStore;
let fakeExec;

const stateKey = `plugin.${PLUGIN_ID}.passthroughState`;
const readState = () => configStore.get(stateKey) || {};

const createService = () => createPassthroughService({
  pluginId: PLUGIN_ID,
  getConfig: (key, defaultValue) => (configStore.has(key) ? configStore.get(key) : defaultValue),
  setConfig: (key, value) => configStore.set(key, value),
  getMachineId: () => 'machine-1',
  resolveBinary: () => 'fake-rclone',
});

const writeLocalSave = async (name, content) => {
  await fs.mkdir(localDir, { recursive: true });
  await fs.writeFile(path.join(localDir, name), content, 'utf8');
};

const writeRemoteMeta = async (meta) => {
  const dir = path.join(remoteRoot, ENTRY_ID);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta), 'utf8');
};

const readRemoteMeta = async () => JSON.parse(
  await fs.readFile(path.join(remoteRoot, ENTRY_ID, 'meta.json'), 'utf8'),
);

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pt-service-test-'));
  remoteRoot = path.join(tmpRoot, 'remote', 'passthrough');
  stageDir = path.join(tmpRoot, 'stage');
  localDir = path.join(tmpRoot, 'saves', ENTRY_ID);
  await fs.mkdir(remoteRoot, { recursive: true });
  await fs.mkdir(stageDir, { recursive: true });
  configStore = new Map();
  configStore.set(`plugin.${PLUGIN_ID}.settings.sync`, { target: TARGET, rclonePath: 'fake-rclone' });
  configStore.set(`plugin.${PLUGIN_ID}.settings.passthroughDirs`, [{ name: ENTRY_NAME, dir: localDir }]);
  fakeExec = createPassthroughFakeExec({ target: TARGET, remoteRoot });
  fakeExecRef.current = fakeExec;
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('passthrough-service 水位持久化', () => {
  it('runSync 上传后把条目水位（远端 meta 的 updatedAt）并入持久状态', async () => {
    // 防止回归：水位只留在内存会让下次对账丢基线，每次都整包重传
    await writeLocalSave('save.dat', 'local');

    const report = await createService().runSync({ exec: fakeExec, target: TARGET });

    expect(report.ok).toBe(true);
    expect(report.updated).toEqual([{ entryId: ENTRY_ID, name: ENTRY_NAME }]);
    const meta = await readRemoteMeta();
    expect(readState().watermarks[ENTRY_ID]).toBe(meta.updatedAt);
  });

  it('水位生效后再次对账：两端无变化跳过传输，不产生数据包读写', async () => {
    // 防止回归：无水位基线时每轮对账都会整包重传/重拉，云盘与 SMB 上是成倍的流量与耗时
    await writeLocalSave('save.dat', 'stable');
    const service = createService();
    await service.runSync({ exec: fakeExec, target: TARGET });

    const calls = [];
    const countingExec = async (args) => {
      calls.push(args);
      return fakeExec(args);
    };
    const report = await service.runSync({ exec: countingExec, target: TARGET });

    expect(report.skipped).toEqual([{ entryId: ENTRY_ID, name: ENTRY_NAME, reason: 'noop' }]);
    expect(calls.filter((args) => args[0] === 'copyto' || args[0] === 'moveto')).toEqual([]);
  });

  it('restoreEntry 回补数据包后记录水位', async () => {
    await writeRemoteZip(path.join(remoteRoot, ENTRY_ID), { 'save.dat': 'remote' });
    await writeRemoteMeta(createMeta({
      entryId: ENTRY_ID, name: ENTRY_NAME, machineId: 'other', at: T1,
    }));

    const result = await createService().restoreEntry({ name: ENTRY_NAME });

    expect(result.success).toBe(true);
    expect(readState().watermarks[ENTRY_ID]).toBe(T1);
    expect(await fs.readFile(path.join(localDir, 'save.dat'), 'utf8')).toBe('remote');
    // meta 只存远端条目根
    expect(await fs.stat(path.join(localDir, 'meta.json')).catch(() => null)).toBe(null);
  });

  it('keep-local 冲突处置后写入非删除 meta 并更新水位', async () => {
    configStore.set(stateKey, {
      conflicts: [{ entryId: ENTRY_ID, name: ENTRY_NAME, detectedAt: T0 }],
      notifications: [],
      lastReport: null,
      lastError: null,
    });
    await writeLocalSave('save.dat', 'local');
    await writeRemoteMeta(markMetaDeleted(createMeta({
      entryId: ENTRY_ID, name: ENTRY_NAME, machineId: 'other', at: T0,
    }), { machineId: 'other', at: T0 }));

    const result = await createService().resolveConflict({ entryId: ENTRY_ID, mode: 'keep-local' });

    expect(result.success).toBe(true);
    expect(readState().conflicts).toEqual([]);
    const meta = await readRemoteMeta();
    expect(meta.deleted).toBe(false);
    expect(readState().watermarks[ENTRY_ID]).toBe(meta.updatedAt);
    expect(await readRemoteZipEntry(path.join(remoteRoot, ENTRY_ID), 'save.dat')).toBe('local');
  });

  it('runSync 水位基线生效：仅远端更新时拉取数据包并前进水位', async () => {
    await writeLocalSave('save.dat', 'local');
    const service = createService();
    await service.runSync({ exec: fakeExec, target: TARGET });

    // 另一台设备上传了新版本（updatedAt 前进到未来，晚于首轮水位）；本机文件不动
    const T2 = '2099-01-01T00:00:00.000Z';
    await writeRemoteZip(path.join(remoteRoot, ENTRY_ID), { 'save.dat': 'remote-v2' });
    await writeRemoteMeta(createMeta({
      entryId: ENTRY_ID, name: ENTRY_NAME, machineId: 'other', at: T2,
    }));

    const report = await service.runSync({ exec: fakeExec, target: TARGET });

    expect(report.updated).toEqual([{ entryId: ENTRY_ID, name: ENTRY_NAME }]);
    expect(await fs.readFile(path.join(localDir, 'save.dat'), 'utf8')).toBe('remote-v2');
    expect(readState().watermarks[ENTRY_ID]).toBe(T2);
  });

  it('双端都有更新 → 记录内容冲突且不传输；use-remote 处置后采用远端并前进水位', async () => {
    // 防止回归：双端均有更新时未进行冲突确认导致覆盖新文件
    await writeLocalSave('save.dat', 'local');
    const service = createService();
    await service.runSync({ exec: fakeExec, target: TARGET });

    // 两端各自更新：本机覆盖写档，另一台设备上传新版本
    await fs.writeFile(path.join(localDir, 'save.dat'), 'local-v2', 'utf8');
    const T2 = '2099-01-01T00:00:00.000Z';
    await writeRemoteZip(path.join(remoteRoot, ENTRY_ID), { 'save.dat': 'remote-v2' });
    await writeRemoteMeta(createMeta({
      entryId: ENTRY_ID, name: ENTRY_NAME, machineId: 'other', at: T2,
    }));

    const report = await service.runSync({ exec: fakeExec, target: TARGET });

    expect(report.conflicts).toEqual([{
      entryId: ENTRY_ID,
      name: ENTRY_NAME,
      kind: 'content',
      localUpdatedAt: expect.any(String),
      remoteUpdatedAt: T2,
      remoteUpdatedBy: 'other',
      detectedAt: expect.any(String),
    }]);
    expect(report.updated).toEqual([]);
    expect(readState().conflicts).toEqual(report.conflicts);
    expect(await fs.readFile(path.join(localDir, 'save.dat'), 'utf8')).toBe('local-v2');

    // 用户选择采用远端：快照替换本机，冲突清除，水位与清单前进
    const res = await service.resolveConflict({ entryId: ENTRY_ID, mode: 'use-remote' });

    expect(res.success).toBe(true);
    expect(await fs.readFile(path.join(localDir, 'save.dat'), 'utf8')).toBe('remote-v2');
    expect(readState().watermarks[ENTRY_ID]).toBe(T2);
    expect(readState().manifests[ENTRY_ID]).toEqual({ 'save.dat': expect.any(String) });
    expect(readState().conflicts).toEqual([]);
  });
});

describe('passthrough-service probeStatus 只读探测', () => {
  it('两端无变化 → noop；且探测不写持久状态、不传输存档', async () => {
    // 防止回归：探测若触发上传/下载或改写水位，卡片状态刷新会造成成倍流量与状态漂移
    await writeLocalSave('save.dat', 'stable');
    const service = createService();
    await service.runSync({ exec: fakeExec, target: TARGET });
    const stateBefore = { ...readState() };
    const localBefore = await fs.readFile(path.join(localDir, 'save.dat'), 'utf8');
    const remoteMetaBefore = await readRemoteMeta();

    const res = await service.probeStatus();

    expect(res.success).toBe(true);
    expect(res.entries).toEqual([{
      entryId: ENTRY_ID,
      name: ENTRY_NAME,
      action: 'noop',
      localExists: true,
      remoteUpdatedAt: remoteMetaBefore.updatedAt,
      remoteDeletedAt: null,
    }]);
    expect(readState()).toEqual(stateBefore);
    expect(await fs.readFile(path.join(localDir, 'save.dat'), 'utf8')).toBe(localBefore);
    expect(await readRemoteMeta()).toEqual(remoteMetaBefore);
  });

  it('仅远端有更新 → sync-download 并带回远端更新时间', async () => {
    await writeLocalSave('save.dat', 'local');
    const service = createService();
    await service.runSync({ exec: fakeExec, target: TARGET });

    const T2 = '2099-01-01T00:00:00.000Z';
    await writeRemoteZip(path.join(remoteRoot, ENTRY_ID), { 'save.dat': 'remote-v2' });
    await writeRemoteMeta(createMeta({
      entryId: ENTRY_ID, name: ENTRY_NAME, machineId: 'other', at: T2,
    }));

    const res = await service.probeStatus();

    expect(res.success).toBe(true);
    expect(res.entries[0].action).toBe('sync-download');
    expect(res.entries[0].remoteUpdatedAt).toBe(T2);
    // 探测不拉取数据包：本地文件保持原样
    expect(await fs.readFile(path.join(localDir, 'save.dat'), 'utf8')).toBe('local');
  });

  it('仅本地有变更 → sync-upload，远端保持原样', async () => {
    await writeLocalSave('save.dat', 'local');
    const service = createService();
    await service.runSync({ exec: fakeExec, target: TARGET });
    const remoteMetaBefore = await readRemoteMeta();

    await fs.writeFile(path.join(localDir, 'save.dat'), 'local-v2', 'utf8');

    const res = await service.probeStatus();

    expect(res.success).toBe(true);
    expect(res.entries[0].action).toBe('sync-upload');
    expect(await readRemoteMeta()).toEqual(remoteMetaBefore);
  });

  it('双端都有更新 → content-conflict（卡片无需等同步跑完即可提示冲突）', async () => {
    await writeLocalSave('save.dat', 'local');
    const service = createService();
    await service.runSync({ exec: fakeExec, target: TARGET });

    await fs.writeFile(path.join(localDir, 'save.dat'), 'local-v2', 'utf8');
    const T2 = '2099-01-01T00:00:00.000Z';
    await writeRemoteZip(path.join(remoteRoot, ENTRY_ID), { 'save.dat': 'remote-v2' });
    await writeRemoteMeta(createMeta({
      entryId: ENTRY_ID, name: ENTRY_NAME, machineId: 'other', at: T2,
    }));

    const res = await service.probeStatus();

    expect(res.success).toBe(true);
    expect(res.entries[0].action).toBe('content-conflict');
  });

  it('远端墓碑晚于本地最新修改 → apply-deletion 并带回删除时间', async () => {
    await writeLocalSave('save.dat', 'local');
    const service = createService();
    await service.runSync({ exec: fakeExec, target: TARGET });

    const deletedAt = '2099-01-01T00:00:00.000Z';
    await writeRemoteMeta(markMetaDeleted(createMeta({
      entryId: ENTRY_ID, name: ENTRY_NAME, machineId: 'other', at: T0,
    }), { machineId: 'other', at: deletedAt }));

    const res = await service.probeStatus();

    expect(res.success).toBe(true);
    expect(res.entries[0].action).toBe('apply-deletion');
    expect(res.entries[0].remoteDeletedAt).toBe(deletedAt);
    expect(res.entries[0].remoteUpdatedAt).toBe(null);
  });

  it('未配置远程目标 → 探测失败并给出提示', async () => {
    configStore.set(`plugin.${PLUGIN_ID}.settings.sync`, { target: '', rclonePath: 'fake-rclone' });

    const res = await createService().probeStatus();

    expect(res.success).toBe(false);
    expect(res.message).toContain('远程目标');
  });
});
