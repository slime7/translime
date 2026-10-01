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
import { runSync, SyncCancelledError } from '../../src/utils/sync/engine';

let tmpRoot;
let backupRoot;
let stageDir;

const baseInfo = (gameId, timestamp, extra = {}) => ({
  schemaVersion: 2,
  gameId,
  gameName: 'Test Game',
  savePaths: [],
  sources: [],
  backupTime: '2026-10-01T10:00:00.000Z',
  timestamp,
  note: '',
  ...extra,
});

// 构造一个本地备份目录（info.json + 数据文件）
const writeBackup = async (root, gameId, timestamp, info) => {
  const dir = path.join(root, gameId, timestamp);
  await fs.mkdir(path.join(dir, 'data_0'), { recursive: true });
  await fs.writeFile(path.join(dir, 'data_0', 'save.dat'), `data-${gameId}-${timestamp}`);
  await fs.writeFile(path.join(dir, 'info.json'), JSON.stringify(info), 'utf8');
  return dir;
};

const createFakeExec = (calls, overrides = {}) => async (args) => {
  calls.push(args);
  const override = overrides[args[0]]?.(args);
  if (override) {
    return override;
  }
  return { code: 0, stdout: '', stderr: '' };
};

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-backup-sync-engine-'));
  backupRoot = path.join(tmpRoot, 'backups');
  stageDir = path.join(tmpRoot, 'stage');
  await fs.mkdir(backupRoot, { recursive: true });
  await fs.mkdir(stageDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

const runWithFakeExec = (calls, overrides) => runSync({
  exec: createFakeExec(calls, overrides),
  target: 'sync-target',
  backupRoot,
  machineId: '11111111-2222-3333-4444-555555555555',
  stageDir,
});

describe('runSync 上传', () => {
  it('本地独有的备份逐目录上传，且 info.json 必须在数据文件之后收尾写入（防止半目录被对端判为完整备份）', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1'));
    await writeBackup(backupRoot, '123', 'ts2', baseInfo('123', 'ts2'));
    const calls = [];

    const report = await runWithFakeExec(calls);

    const copyCalls = calls.filter(([cmd]) => cmd === 'copy');
    const uploadCopies = copyCalls.filter(([, src]) => src.startsWith(backupRoot));
    expect(uploadCopies).toHaveLength(2);
    uploadCopies.forEach(([, src, dest]) => {
      const timestamp = path.basename(src);
      expect(dest).toBe(`sync-target/123/${timestamp}`);
      expect(src.endsWith('info.json')).toBe(false);
    });
    // 每个目录的最后一次调用都是 info.json 的 copyto
    const copytoCalls = calls.filter(([cmd]) => cmd === 'copyto');
    expect(copytoCalls).toHaveLength(2);
    copytoCalls.forEach(([, src, dest]) => {
      expect(src.endsWith('info.json')).toBe(true);
      expect(dest.endsWith('/info.json')).toBe(true);
    });
    const ts1CopyIndex = calls.findIndex(([, src]) => path.basename(src) === 'ts1');
    const ts1InfoIndex = calls.findIndex(([, src]) => src.endsWith(path.join('ts1', 'info.json')));
    expect(ts1InfoIndex).toBeGreaterThan(ts1CopyIndex);

    expect(report.ok).toBe(true);
    expect(report.totals).toEqual({ uploads: 2, downloads: 0, renames: 0 });
    expect(report.perGame['123']).toEqual({ uploads: 2, downloads: 0, renames: 0 });
  });

  it('远端根目录尚不存在（rclone 退出码 3）视为空远端，全部上传而不是失败（首次同步）', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1'));
    const calls = [];

    const report = await runWithFakeExec(calls, {
      copy: (args) => {
        if (args[1] === 'sync-target' && args[2] === stageDir) {
          return { code: 3, stdout: '', stderr: 'Directory not found.' };
        }
        return null;
      },
    });

    expect(report.ok).toBe(true);
    expect(report.totals.uploads).toBe(1);
  });

  it('远端清单拉取因其他错误失败时中止并携带 rclone 错误信息（不把故障误报为空远端）', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1'));
    const calls = [];

    await expect(runWithFakeExec(calls, {
      copy: (args) => {
        if (args[1] === 'sync-target' && args[2] === stageDir) {
          return { code: 1, stdout: '', stderr: 'Failed to configure remote: bad token' };
        }
        return null;
      },
    })).rejects.toThrow('读取远端清单失败');
  });
});

describe('runSync 下载', () => {
  it('远端独有的备份逐目录下载（info.json 收尾），本地已有且一致的目录不动', async () => {
    const syncedInfo = baseInfo('123', 'ts-synced');
    await writeBackup(backupRoot, '123', 'ts-synced', syncedInfo);
    // stage 里远端有两份：一份与本地一致，一份本地没有
    await writeBackup(stageDir, '123', 'ts-synced', syncedInfo);
    await writeBackup(stageDir, '123', 'ts-remote-only', baseInfo('123', 'ts-remote-only', {
      createdBy: 'other-machine',
    }));
    const calls = [];

    const report = await runWithFakeExec(calls);

    const downloadCopies = calls.filter(([cmd, src]) => cmd === 'copy' && src === 'sync-target/123/ts-remote-only');
    expect(downloadCopies).toHaveLength(1);
    expect(downloadCopies[0][2]).toBe(path.join(backupRoot, '123', 'ts-remote-only'));
    // 一致的目录不应有任何远端 → 本地的数据复制
    expect(calls.some(([cmd, src]) => cmd === 'copy' && src === 'sync-target/123/ts-synced')).toBe(false);

    expect(report.totals).toEqual({ uploads: 0, downloads: 1, renames: 0 });
  });
});

describe('runSync 冲突', () => {
  it('同名目录摘要不一致：本地目录改名为 <ts>-<machineId> 后上传副本，并回补下载远端原件（两份都保留）', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-a' }));
    await writeBackup(stageDir, '123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-b' }));
    const calls = [];

    const report = await runWithFakeExec(calls);

    const renamedDir = path.join(backupRoot, '123', 'ts1-11111111');
    await expect(fs.stat(renamedDir)).resolves.toBeTruthy();
    await expect(fs.stat(path.join(backupRoot, '123', 'ts1'))).rejects.toThrow();

    expect(calls.some(([, src]) => src === renamedDir)).toBe(true);
    expect(calls.some(([, , dest]) => dest === 'sync-target/123/ts1-11111111')).toBe(true);
    expect(calls.some(([, src]) => src === 'sync-target/123/ts1')).toBe(true);

    expect(report.totals).toEqual({ uploads: 1, downloads: 1, renames: 1 });
    expect(report.perGame['123']).toEqual({ uploads: 1, downloads: 1, renames: 1 });
  });
});

describe('runSync 取消', () => {
  it('取消后停止后续目录并抛出 SyncCancelledError，不再执行任何 rclone 操作', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1'));
    await writeBackup(backupRoot, '123', 'ts2', baseInfo('123', 'ts2'));
    const calls = [];
    let cancelled = false;

    await expect(runSync({
      exec: async (args) => {
        calls.push(args);
        if (args[0] === 'copyto') {
          cancelled = true;
        }
        return { code: 0, stdout: '', stderr: '' };
      },
      target: 'sync-target',
      backupRoot,
      machineId: 'machine-a',
      stageDir,
      isCancelled: () => cancelled,
    })).rejects.toThrow(SyncCancelledError);

    const stagingCalls = 1; // 拉取远端清单
    const ts1Calls = 2; // copy 数据 + copyto info.json
    expect(calls.length).toBe(stagingCalls + ts1Calls);
  });
});
