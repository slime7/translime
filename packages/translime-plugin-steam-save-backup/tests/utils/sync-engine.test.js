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
  deleteRemoteBackup,
  listRemoteGameEntries,
  resolveConflict,
  runSync,
  SyncCancelledError,
} from '../../src/utils/sync/engine';

let tmpRoot;
let backupRoot;
let stageDir;
let remoteRoot;
let target;

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

// 在模拟远端放置一份新格式备份：`<gameId>/<ts>/` 目录下的 data.zip（不含 info.json）与 info.json
const writeRemotePair = async (gameId, timestamp, info) => {
  const srcDir = path.join(tmpRoot, 'pair-src', gameId, timestamp);
  await fs.mkdir(path.join(srcDir, 'data_0'), { recursive: true });
  await fs.writeFile(path.join(srcDir, 'data_0', 'save.dat'), `remote-${gameId}-${timestamp}`);
  await fs.writeFile(path.join(srcDir, 'info.json'), JSON.stringify(info), 'utf8');
  const { createArchive } = await import('../../src/utils/sync/archive');
  const remoteDir = path.join(remoteRoot, gameId, timestamp);
  await fs.mkdir(remoteDir, { recursive: true });
  await createArchive(srcDir, path.join(remoteDir, 'data.zip'), { excludeInfo: true });
  await fs.copyFile(path.join(srcDir, 'info.json'), path.join(remoteDir, 'info.json'));
  await fs.rm(path.join(tmpRoot, 'pair-src'), { recursive: true, force: true });
};

// 在模拟远端放置一份散文件目录形态备份（info.json + 散文件 data_N）
const writeRemoteLegacy = async (gameId, timestamp, info) => {
  const dir = path.join(remoteRoot, gameId, timestamp);
  await fs.mkdir(path.join(dir, 'data_0'), { recursive: true });
  await fs.writeFile(path.join(dir, 'data_0', 'save.dat'), `remote-${gameId}-${timestamp}`);
  await fs.writeFile(path.join(dir, 'info.json'), JSON.stringify(info), 'utf8');
};

/**
 * 基于磁盘上的“模拟远端”实现 rclone 命令：copy/copyto/moveto/purge/lsf 都
 * 真实操作文件，使打包、原子改名、元数据外置与散文件目录迁移得到端到端验证
 */
const makeFakeExec = () => {
  const remotePath = (p) => p.replaceAll('/', path.sep);
  const copyIntoStage = async () => {
    // 模拟 staging：只把远端的 `<game>/<ts>/info.json` 复制进 stage（保持目录结构）
    const walk = async (dir, rel) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      await Promise.all(entries.map(async (entry) => {
        const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(entryPath, entryRel);
          return;
        }
        const isInfo = entryRel.split('/').length === 3 && entry.name === 'info.json';
        if (!isInfo) {
          return;
        }
        const dest = path.join(stageDir, entryRel);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(entryPath, dest);
      }));
    };
    await walk(remoteRoot, '');
  };
  const listFilesRecursive = async (dir) => {
    const files = [];
    const walk = async (current, rel) => {
      const entries = await fs.readdir(current, { withFileTypes: true });
      await Promise.all(entries.map(async (entry) => {
        const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          await walk(entryPath, entryRel);
          return;
        }
        files.push(entryRel);
      }));
    };
    await walk(dir, '');
    return files;
  };

  return async (args) => {
    const [cmd, src, dest] = args;
    if (cmd === 'copy' && src.replaceAll('\\', '/') === target.replaceAll('\\', '/')) {
      if (!(await fs.stat(remoteRoot).catch(() => null))) {
        return { code: 3, stdout: '', stderr: 'Directory not found.' };
      }
      await copyIntoStage();
      return { code: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'copy' || cmd === 'copyto') {
      const srcPath = remotePath(src);
      if (!(await fs.stat(srcPath).catch(() => null))) {
        return { code: 3, stdout: '', stderr: 'object not found' };
      }
      await fs.mkdir(path.dirname(remotePath(dest)), { recursive: true });
      if (cmd === 'copy') {
        await fs.cp(srcPath, remotePath(dest), { recursive: true, force: true });
      } else {
        await fs.copyFile(srcPath, remotePath(dest));
      }
      return { code: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'moveto') {
      await fs.rename(remotePath(src), remotePath(dest));
      return { code: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'purge') {
      const targetPath = remotePath(src);
      if (!(await fs.stat(targetPath).catch(() => null))) {
        return { code: 3, stdout: '', stderr: 'Directory not found.' };
      }
      await fs.rm(targetPath, { recursive: true, force: true });
      return { code: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'lsf') {
      const base = remotePath(src);
      if (!(await fs.stat(base).catch(() => null))) {
        return { code: 3, stdout: '', stderr: 'Directory not found.' };
      }
      if (args.includes('--dirs-only')) {
        const entries = await fs.readdir(base, { withFileTypes: true });
        return {
          code: 0,
          stdout: `${entries.filter((entry) => entry.isDirectory()).map((entry) => `${entry.name}/`).join('\n')}\n`,
          stderr: '',
        };
      }
      const files = await listFilesRecursive(base);
      return { code: 0, stdout: `${files.join('\n')}\n`, stderr: '' };
    }
    return { code: 0, stdout: '', stderr: '' };
  };
};

const runWithFakeExec = (calls) => runSync({
  exec: (args) => {
    calls.push(args);
    return makeFakeExec()(args);
  },
  target,
  backupRoot,
  stageDir,
});

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-backup-sync-engine-'));
  backupRoot = path.join(tmpRoot, 'backups');
  stageDir = path.join(tmpRoot, 'stage');
  remoteRoot = path.join(tmpRoot, 'remote');
  target = remoteRoot.replaceAll('\\', '/');
  await fs.mkdir(backupRoot, { recursive: true });
  await fs.mkdir(stageDir, { recursive: true });
  await fs.mkdir(remoteRoot, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('runSync 上传', () => {
  it('本地独有的备份上传为新格式目录：先传 data.zip.part 再 moveto，最后写 info.json；数据包不含 info.json', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1'));
    const calls = [];

    const report = await runWithFakeExec(calls);

    // 远端出现 `<ts1>/` 目录：info.json 与 data.zip 并列，无 .part 残留
    const backupEntries = (await fs.readdir(path.join(remoteRoot, '123', 'ts1'))).sort();
    expect(backupEntries).toEqual(['data.zip', 'info.json']);
    const remoteEntries = await fs.readdir(path.join(remoteRoot, '123'));
    expect(remoteEntries).toEqual(['ts1']);

    // 数据包不含 info.json（元数据外置，对账无需解包），数据文件完整
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(path.join(remoteRoot, '123', 'ts1', 'data.zip'));
    expect(zip.getEntry('info.json')).toBeNull();
    expect(zip.getEntry('data_0/save.dat')).toBeTruthy();
    // 外置 info.json 与本地一致
    const remoteInfo = JSON.parse(await fs.readFile(path.join(remoteRoot, '123', 'ts1', 'info.json'), 'utf8'));
    expect(remoteInfo.gameId).toBe('123');

    // 调用顺序：copyto 传 .part → moveto 改名 → copyto 写 info.json（存在即完整）
    const normalize = (value) => String(value).replaceAll('\\', '/');
    const partIdx = calls.findIndex(([cmd, , dest]) => cmd === 'copyto' && normalize(dest).endsWith('ts1/data.zip.part'));
    const moveIdx = calls.findIndex(([cmd, src]) => cmd === 'moveto' && normalize(src).endsWith('ts1/data.zip.part'));
    const infoIdx = calls.findIndex(([cmd, , dest]) => cmd === 'copyto' && normalize(dest).endsWith('ts1/info.json'));
    expect(partIdx).toBeGreaterThanOrEqual(0);
    expect(moveIdx).toBeGreaterThan(partIdx);
    expect(infoIdx).toBeGreaterThan(moveIdx);

    expect(report.ok).toBe(true);
    expect(report.totals).toEqual({
      uploads: 1, downloads: 0, conflicts: 0, migrated: 0,
    });
    expect(report.perGame['123']).toEqual({
      uploads: 1, downloads: 0, conflicts: 0, migrated: 0,
    });
  });

  it('远端根目录尚不存在（rclone 退出码 3）视为空远端，全部上传而不是失败（首次同步）', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1'));
    await fs.rm(remoteRoot, { recursive: true, force: true });

    const report = await runWithFakeExec([]);

    expect(report.ok).toBe(true);
    expect(report.totals.uploads).toBe(1);
  });

  it('远端清单拉取因其他错误失败时中止并携带 rclone 错误信息（不把故障误报为空远端）', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1'));

    await expect(runSync({
      exec: async () => ({ code: 1, stdout: '', stderr: 'Failed to configure remote: bad token' }),
      target,
      backupRoot,
      stageDir,
    })).rejects.toThrow('读取远端清单失败');
  });
});

describe('runSync 下载', () => {
  it('远端独有的新格式备份下载并解压为本地目录（新装机取回全部备份）', async () => {
    await writeBackup(backupRoot, '123', 'ts-synced', baseInfo('123', 'ts-synced'));
    await writeBackup(backupRoot, '123', 'ts-other', baseInfo('123', 'ts-other'));
    // 首次同步：两份备份都上传为新格式
    await runWithFakeExec([]);
    // 模拟新装机：本地备份全部丢失
    await fs.rm(path.join(backupRoot, '123'), { recursive: true, force: true });

    const report = await runWithFakeExec([]);

    // 本地重新出现两个备份目录，数据与元数据都来自远端
    const localDirs = (await fs.readdir(path.join(backupRoot, '123'))).sort();
    expect(localDirs).toEqual(['ts-other', 'ts-synced']);
    const restored = JSON.parse(await fs.readFile(path.join(backupRoot, '123', 'ts-other', 'info.json'), 'utf8'));
    expect(restored.gameId).toBe('123');
    await expect(fs.stat(path.join(backupRoot, '123', 'ts-other', 'data_0', 'save.dat'))).resolves.toBeTruthy();
    expect(report.totals).toEqual({
      uploads: 0, downloads: 2, conflicts: 0, migrated: 0,
    });
  });

  it('对端新上传的新格式备份在下次对账时下载到本地（多设备收敛）', async () => {
    // 本机上传 ts1 后模拟“另一台设备”直接向远端放置新格式备份
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1'));
    await runWithFakeExec([]);

    await writeRemotePair('123', 'ts-peer', baseInfo('123', 'ts-peer', { createdBy: 'other-machine' }));

    const report = await runWithFakeExec([]);

    const restored = JSON.parse(await fs.readFile(path.join(backupRoot, '123', 'ts-peer', 'info.json'), 'utf8'));
    expect(restored.createdBy).toBe('other-machine');
    expect(report.totals).toEqual({
      uploads: 0, downloads: 1, conflicts: 0, migrated: 0,
    });
  });
});

describe('runSync 散文件目录迁移', () => {
  it('远端散文件目录且本地缺失：先取回本地，打包上传后清理散文件数据目录（downloads 与 migrated 各计一次）', async () => {
    await writeRemoteLegacy('123', 'ts-legacy', baseInfo('123', 'ts-legacy'));

    const report = await runWithFakeExec([]);

    // 远端该备份目录只剩 info.json 与 data.zip，散文件目录被清理
    const backupEntries = (await fs.readdir(path.join(remoteRoot, '123', 'ts-legacy'))).sort();
    expect(backupEntries).toEqual(['data.zip', 'info.json']);
    // 本地取回了该备份
    const localInfo = JSON.parse(await fs.readFile(path.join(backupRoot, '123', 'ts-legacy', 'info.json'), 'utf8'));
    expect(localInfo.gameId).toBe('123');
    expect(report.totals).toEqual({
      uploads: 0, downloads: 1, conflicts: 0, migrated: 1,
    });
  });

  it('本地与远端散文件目录内容一致：无需下载，直接打包上传并清理散文件数据目录', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1'));
    await writeRemoteLegacy('123', 'ts1', baseInfo('123', 'ts1'));

    const report = await runWithFakeExec([]);

    const backupEntries = (await fs.readdir(path.join(remoteRoot, '123', 'ts1'))).sort();
    expect(backupEntries).toEqual(['data.zip', 'info.json']);
    expect(report.totals).toEqual({
      uploads: 0, downloads: 0, conflicts: 0, migrated: 1,
    });
    // 再次对账无任何动作（迁移幂等）
    const second = await runWithFakeExec([]);
    expect(second.totals).toEqual({
      uploads: 0, downloads: 0, conflicts: 0, migrated: 0,
    });
  });

  it('散文件目录与本地内容分叉时不自动迁移，转为冲突待处理（远端目录保持不动）', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-a' }));
    await writeRemoteLegacy('123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-b' }));

    const report = await runWithFakeExec([]);

    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0]).toMatchObject({
      gameId: '123',
      dir: 'ts1',
      remoteKind: 'dir',
      local: { createdBy: 'machine-a' },
      remote: { createdBy: 'machine-b' },
    });
    // 远端旧目录未被清理，本地目录未被改名
    await expect(fs.stat(path.join(remoteRoot, '123', 'ts1', 'info.json'))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(backupRoot, '123', 'ts1', 'info.json'))).resolves.toBeTruthy();
  });
});

describe('runSync 冲突', () => {
  it('同名备份摘要不一致：不自动合并，报告 conflicts（新格式）并附两端展示信息', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-a' }));
    // 第一次同步上传 machine-a 版本
    await runWithFakeExec([]);
    // 本地内容变化 → 与远端分叉
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-c' }));

    const report = await runWithFakeExec([]);

    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0]).toMatchObject({
      gameId: '123',
      dir: 'ts1',
      remoteKind: 'zip',
      local: { createdBy: 'machine-c' },
      remote: { createdBy: 'machine-a' },
    });
    expect(report.totals).toEqual({
      uploads: 0, downloads: 0, conflicts: 1, migrated: 0,
    });
  });
});

describe('runSync 取消', () => {
  it('取消后停止后续备份并抛出 SyncCancelledError', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1'));
    await writeBackup(backupRoot, '123', 'ts2', baseInfo('123', 'ts2'));
    const calls = [];
    let cancelled = false;

    await expect(runSync({
      exec: async (args) => {
        calls.push(args);
        if (args[0] === 'moveto') {
          cancelled = true;
        }
        if (args[0] === 'copyto' && cancelled) {
          throw new SyncCancelledError();
        }
        return makeFakeExec()(args);
      },
      target,
      backupRoot,
      stageDir,
      isCancelled: () => cancelled,
    })).rejects.toThrow(SyncCancelledError);

    // 第一个备份完成了 moveto，第二个备份在 copyto 阶段被取消
    expect(calls.filter(([cmd]) => cmd === 'moveto')).toHaveLength(1);
  });
});

describe('resolveConflict', () => {
  const baseResolveOptions = () => ({
    target,
    backupRoot,
    gameId: '123',
    dir: 'ts1',
    machineId: '11111111-2222-3333-4444-555555555555',
  });

  it('overwrite-local（新格式）：删除本地版本并从远程数据包回补（以远程为准）', async () => {
    // 远端持有 machine-b 版本
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-b' }));
    const exec = makeFakeExec();
    await runSync({
      exec, target, backupRoot, stageDir,
    });
    // 本地改回 machine-a 版本制造分叉
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-a' }));

    await resolveConflict({
      ...baseResolveOptions(),
      exec,
      remoteKind: 'zip',
      mode: 'overwrite-local',
    });

    const info = JSON.parse(await fs.readFile(path.join(backupRoot, '123', 'ts1', 'info.json'), 'utf8'));
    expect(info.createdBy).toBe('machine-b');
    await expect(fs.stat(path.join(backupRoot, '123', 'ts1', 'data_0', 'save.dat'))).resolves.toBeTruthy();
  });

  it('overwrite-remote（新格式）：本地版本打包上传覆盖远程（以本地为准）', async () => {
    // 远端持有 machine-b 版本
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-b' }));
    const exec = makeFakeExec();
    await runSync({
      exec, target, backupRoot, stageDir,
    });
    // 本地是 machine-a 版本 → 分叉
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-a' }));

    await resolveConflict({
      ...baseResolveOptions(),
      exec,
      remoteKind: 'zip',
      mode: 'overwrite-remote',
    });

    // 重新对账：两端一致，无冲突无动作
    const report = await runSync({
      exec, target, backupRoot, stageDir,
    });
    const localInfo = JSON.parse(await fs.readFile(path.join(backupRoot, '123', 'ts1', 'info.json'), 'utf8'));
    expect(localInfo.createdBy).toBe('machine-a');
    const remoteInfo = JSON.parse(await fs.readFile(path.join(remoteRoot, '123', 'ts1', 'info.json'), 'utf8'));
    expect(remoteInfo.createdBy).toBe('machine-a');
    expect(report.conflicts).toHaveLength(0);
    expect(report.totals).toEqual({
      uploads: 0, downloads: 0, conflicts: 0, migrated: 0,
    });
  });

  it('keep-both：本地改名保留并上传副本，远程原件回补下载（两份都保留）', async () => {
    // 远端持有 machine-b 版本
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-b' }));
    const exec = makeFakeExec();
    await runSync({
      exec, target, backupRoot, stageDir,
    });
    // 本地是 machine-a 版本 → 分叉
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-a' }));

    const result = await resolveConflict({
      ...baseResolveOptions(),
      exec,
      remoteKind: 'zip',
      mode: 'keep-both',
    });

    expect(result.renamedTo).toBe('ts1-11111111');
    const localDirs = (await fs.readdir(path.join(backupRoot, '123'))).sort();
    expect(localDirs).toEqual(['ts1', 'ts1-11111111']);
    const renamed = JSON.parse(await fs.readFile(path.join(backupRoot, '123', 'ts1-11111111', 'info.json'), 'utf8'));
    const original = JSON.parse(await fs.readFile(path.join(backupRoot, '123', 'ts1', 'info.json'), 'utf8'));
    expect(renamed.createdBy).toBe('machine-a');
    expect(original.createdBy).toBe('machine-b');
    // 远端两份备份目录都在
    const remoteEntries = (await fs.readdir(path.join(remoteRoot, '123'))).sort();
    expect(remoteEntries).toEqual(['ts1', 'ts1-11111111']);
    // 再次对账无任何动作
    const report = await runSync({
      exec, target, backupRoot, stageDir,
    });
    expect(report.conflicts).toHaveLength(0);
    expect(report.totals).toEqual({
      uploads: 0, downloads: 0, conflicts: 0, migrated: 0,
    });
  });

  it('overwrite-remote（散文件目录）：上传数据包覆盖后清理散文件数据目录，远端收敛为数据包形态', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-a' }));
    await writeRemoteLegacy('123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-b' }));
    const exec = makeFakeExec();

    await resolveConflict({
      ...baseResolveOptions(),
      exec,
      remoteKind: 'dir',
      mode: 'overwrite-remote',
    });

    const backupEntries = (await fs.readdir(path.join(remoteRoot, '123', 'ts1'))).sort();
    expect(backupEntries).toEqual(['data.zip', 'info.json']);
    const remoteInfo = JSON.parse(await fs.readFile(path.join(remoteRoot, '123', 'ts1', 'info.json'), 'utf8'));
    expect(remoteInfo.createdBy).toBe('machine-a');
  });

  it('keep-both（散文件目录）：远端散文件目录保留不动，下次对账自动迁移为数据包', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-a' }));
    await writeRemoteLegacy('123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-b' }));
    const exec = makeFakeExec();

    const result = await resolveConflict({
      ...baseResolveOptions(),
      exec,
      remoteKind: 'dir',
      mode: 'keep-both',
    });

    expect(result.renamedTo).toBe('ts1-11111111');
    // 本地两份：改名保留的 machine-a 与回补的 machine-b 原件
    const renamed = JSON.parse(await fs.readFile(path.join(backupRoot, '123', 'ts1-11111111', 'info.json'), 'utf8'));
    const original = JSON.parse(await fs.readFile(path.join(backupRoot, '123', 'ts1', 'info.json'), 'utf8'));
    expect(renamed.createdBy).toBe('machine-a');
    expect(original.createdBy).toBe('machine-b');
    // 远端旧目录（含散文件）尚未动，改名副本已上传
    expect((await fs.readdir(path.join(remoteRoot, '123'))).sort()).toEqual(['ts1', 'ts1-11111111']);
    await expect(fs.stat(path.join(remoteRoot, '123', 'ts1', 'data_0', 'save.dat'))).resolves.toBeTruthy();

    // 后续对账：旧目录自动迁移为数据包，两端收敛为两份新格式备份
    const report = await runSync({
      exec, target, backupRoot, stageDir,
    });
    const backupEntries = (await fs.readdir(path.join(remoteRoot, '123', 'ts1'))).sort();
    expect(backupEntries).toEqual(['data.zip', 'info.json']);
    expect((await fs.readdir(path.join(remoteRoot, '123'))).sort()).toEqual(['ts1', 'ts1-11111111']);
    expect(report.conflicts).toHaveLength(0);
    expect(report.totals.migrated).toBe(1);
  });

  it('未知处理方式直接报错，不产生任何文件操作', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1'));

    await expect(resolveConflict({
      ...baseResolveOptions(),
      exec: makeFakeExec(),
      mode: 'nonsense',
    })).rejects.toThrow('未知的冲突处理方式');

    await expect(fs.stat(path.join(backupRoot, '123', 'ts1'))).resolves.toBeTruthy();
  });
});

describe('远端条目列举与删除', () => {
  it('listRemoteGameEntries 返回远端备份目录名', async () => {
    await writeRemotePair('123', 'ts1', baseInfo('123', 'ts1'));
    await writeRemotePair('123', 'ts2', baseInfo('123', 'ts2'));

    const entries = await listRemoteGameEntries(makeFakeExec(), target, '123');
    expect(entries.sort()).toEqual(['ts1', 'ts2']);
  });

  it('deleteRemoteBackup 清理远端备份目录，条目不存在不报错', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1'));
    await writeRemoteLegacy('123', 'ts2', baseInfo('123', 'ts2'));
    await writeRemotePair('123', 'ts3', baseInfo('123', 'ts3'));
    await runWithFakeExec([]);

    await deleteRemoteBackup(makeFakeExec(), target, '123', 'ts1');
    await deleteRemoteBackup(makeFakeExec(), target, '123', 'ts2');
    await deleteRemoteBackup(makeFakeExec(), target, '123', 'ts3');
    await deleteRemoteBackup(makeFakeExec(), target, '123', 'not-exist');

    const remoteEntries = await fs.readdir(path.join(remoteRoot, '123'));
    expect(remoteEntries).toEqual([]);
  });
});
