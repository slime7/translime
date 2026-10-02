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

// 在模拟远端放置一份旧目录格式备份
const writeRemoteLegacy = async (gameId, timestamp, info) => {
  const dir = path.join(remoteRoot, gameId, timestamp);
  await fs.mkdir(path.join(dir, 'data_0'), { recursive: true });
  await fs.writeFile(path.join(dir, 'data_0', 'save.dat'), `remote-${gameId}-${timestamp}`);
  await fs.writeFile(path.join(dir, 'info.json'), JSON.stringify(info), 'utf8');
};

/**
 * 基于磁盘上的“模拟远端”实现 rclone 命令：copy/copyto/moveto/purge/lsf 都
 * 真实操作文件，使 zip 打包、原子改名与旧格式迁移得到端到端验证
 */
const makeFakeExec = () => {
  const remotePath = (p) => p.replaceAll('/', path.sep);
  const copyIntoStage = async () => {
    // 模拟 staging：把远端的 zip 与旧格式 info.json 复制进 stage（保持目录结构）
    const walk = async (dir, rel) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      await Promise.all(entries.map(async (entry) => {
        const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(entryPath, entryRel);
          return;
        }
        const isZip = entry.name.endsWith('.zip');
        const isInfo = entryRel.split('/').length === 3 && entry.name === 'info.json';
        if (!isZip && !isInfo) {
          return;
        }
        const dest = path.join(stageDir, entryRel);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(entryPath, dest);
      }));
    };
    await walk(remoteRoot, '');
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
      await fs.rm(remotePath(src), { recursive: true, force: true });
      return { code: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'lsf') {
      const entries = await fs.readdir(remotePath(src)).catch(() => []);
      return { code: 0, stdout: `${entries.map((name) => `${name}/`).join('\n')}\n`, stderr: '' };
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
  it('本地独有的备份打包上传为远端 zip：先传 .part 再 moveto 改名（远端只在完整时可见）', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1'));
    const calls = [];

    const report = await runWithFakeExec(calls);

    // 远端出现完整 zip，无 .part 残留
    await expect(fs.stat(path.join(remoteRoot, '123', 'ts1.zip'))).resolves.toBeTruthy();
    const remoteEntries = await fs.readdir(path.join(remoteRoot, '123'));
    expect(remoteEntries).toEqual(['ts1.zip']);

    // 调用序列：copyto 传 .part → moveto 改名
    expect(calls.some(([cmd, , dest]) => cmd === 'copyto' && dest.replaceAll('\\', '/').endsWith('ts1.zip.part'))).toBe(true);
    expect(calls.some(([cmd, src, dest]) => cmd === 'moveto'
      && src.replaceAll('\\', '/').endsWith('ts1.zip.part')
      && dest.replaceAll('\\', '/').endsWith('ts1.zip'))).toBe(true);

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
  it('远端独有的 zip 备份下载并解压为本地目录（新装机取回全部备份）', async () => {
    await writeBackup(backupRoot, '123', 'ts-synced', baseInfo('123', 'ts-synced'));
    await writeBackup(backupRoot, '123', 'ts-other', baseInfo('123', 'ts-other'));
    // 首次同步：两份备份都上传为 zip
    await runWithFakeExec([]);
    // 模拟新装机：本地备份全部丢失
    await fs.rm(path.join(backupRoot, '123'), { recursive: true, force: true });

    const report = await runWithFakeExec([]);

    // 本地重新出现两个备份目录，内容来自远端 zip
    const localDirs = (await fs.readdir(path.join(backupRoot, '123'))).sort();
    expect(localDirs).toEqual(['ts-other', 'ts-synced']);
    const restored = JSON.parse(await fs.readFile(path.join(backupRoot, '123', 'ts-other', 'info.json'), 'utf8'));
    expect(restored.gameId).toBe('123');
    expect(report.totals).toEqual({
      uploads: 0, downloads: 2, conflicts: 0, migrated: 0,
    });
  });

  it('对端新上传的 zip 备份在下次对账时下载到本地（多设备收敛）', async () => {
    // 本机上传 ts1 后模拟“另一台设备”直接向远端放置新 zip
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1'));
    await runWithFakeExec([]);

    const peerInfo = baseInfo('123', 'ts-peer', { createdBy: 'other-machine' });
    const stageHelperDir = await writeBackup(backupRoot, '123', 'ts-stage-helper', peerInfo);
    const { createArchive } = await import('../../src/utils/sync/archive');
    await createArchive(stageHelperDir, path.join(remoteRoot, '123', 'ts-peer.zip'));
    await fs.rm(path.join(backupRoot, '123', 'ts-stage-helper'), { recursive: true, force: true });

    const report = await runWithFakeExec([]);

    const restored = JSON.parse(await fs.readFile(path.join(backupRoot, '123', 'ts-peer', 'info.json'), 'utf8'));
    expect(restored.createdBy).toBe('other-machine');
    expect(report.totals).toEqual({
      uploads: 0, downloads: 1, conflicts: 0, migrated: 0,
    });
  });
});

describe('runSync 旧目录格式迁移', () => {
  it('远端旧目录格式备份自动迁移为 zip：本地缺失时先取回，打包上传后清理旧目录', async () => {
    await writeRemoteLegacy('123', 'ts-legacy', baseInfo('123', 'ts-legacy'));

    const report = await runWithFakeExec([]);

    // 远端只剩 zip，旧目录被清理
    const remoteEntries = await fs.readdir(path.join(remoteRoot, '123'));
    expect(remoteEntries).toEqual(['ts-legacy.zip']);
    // 本地取回了该备份
    const localInfo = JSON.parse(await fs.readFile(path.join(backupRoot, '123', 'ts-legacy', 'info.json'), 'utf8'));
    expect(localInfo.gameId).toBe('123');
    expect(report.totals).toEqual({
      uploads: 0, downloads: 0, conflicts: 0, migrated: 1,
    });
  });

  it('旧目录格式与本地内容分叉时不自动迁移，转为冲突待处理（远端目录保持不动）', async () => {
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
  it('同名备份摘要不一致：不自动合并，报告 conflicts（zip 格式）并附两端展示信息', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-a' }));
    // 第一次同步上传 machine-a 版本
    await runWithFakeExec([]);
    // 本地内容变化 → 与远端 zip 分叉
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
    stageDir,
  });

  it('overwrite-local（zip）：删除本地版本并从远程 zip 回补（以远程为准）', async () => {
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
  });

  it('overwrite-remote（zip）：本地版本打包上传覆盖远程（以本地为准）', async () => {
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
    // 远端两份 zip 都在
    const remoteEntries = (await fs.readdir(path.join(remoteRoot, '123'))).sort();
    expect(remoteEntries).toEqual(['ts1-11111111.zip', 'ts1.zip']);
    // 再次对账无任何动作
    const report = await runSync({
      exec, target, backupRoot, stageDir,
    });
    expect(report.conflicts).toHaveLength(0);
    expect(report.totals).toEqual({
      uploads: 0, downloads: 0, conflicts: 0, migrated: 0,
    });
  });

  it('旧目录格式的冲突：keep-both 处理完后远端旧目录被清理并迁移为 zip', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-a' }));
    await writeRemoteLegacy('123', 'ts1', baseInfo('123', 'ts1', { createdBy: 'machine-b' }));
    const exec = makeFakeExec();

    await resolveConflict({
      ...baseResolveOptions(),
      exec,
      remoteKind: 'dir',
      mode: 'keep-both',
    });

    // 远端旧目录被清理，已上传本地改名副本；远程原件已取回本地（随下次对账打包上传）
    const remoteEntries = await fs.readdir(path.join(remoteRoot, '123'));
    expect(remoteEntries).toEqual(['ts1-11111111.zip']);
    const renamed = JSON.parse(await fs.readFile(path.join(backupRoot, '123', 'ts1-11111111', 'info.json'), 'utf8'));
    const original = JSON.parse(await fs.readFile(path.join(backupRoot, '123', 'ts1', 'info.json'), 'utf8'));
    expect(renamed.createdBy).toBe('machine-a');
    expect(original.createdBy).toBe('machine-b');
    // 后续对账把回补的原件也上传为 zip，两端收敛为两份
    const report = await runSync({
      exec, target, backupRoot, stageDir,
    });
    const remoteAfter = (await fs.readdir(path.join(remoteRoot, '123'))).sort();
    expect(remoteAfter).toEqual(['ts1-11111111.zip', 'ts1.zip']);
    expect(report.conflicts).toHaveLength(0);
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
  it('listRemoteGameEntries 返回远端条目名（zip 与目录）', async () => {
    const { createArchive } = await import('../../src/utils/sync/archive');
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1'));
    await createArchive(path.join(backupRoot, '123', 'ts1'), path.join(remoteRoot, '123', 'ts1.zip'));
    await writeRemoteLegacy('123', 'ts2', baseInfo('123', 'ts2'));

    const entries = await listRemoteGameEntries(makeFakeExec(), target, '123');
    expect(entries.sort()).toEqual(['ts1.zip', 'ts2']);
  });

  it('deleteRemoteBackup 同时清理 zip 与旧目录格式，条目不存在不报错', async () => {
    await writeBackup(backupRoot, '123', 'ts1', baseInfo('123', 'ts1'));
    await writeRemoteLegacy('123', 'ts2', baseInfo('123', 'ts2'));
    await runWithFakeExec([]);

    await deleteRemoteBackup(makeFakeExec(), target, '123', 'ts1');
    await deleteRemoteBackup(makeFakeExec(), target, '123', 'ts2');
    await deleteRemoteBackup(makeFakeExec(), target, '123', 'not-exist');

    const remoteEntries = await fs.readdir(path.join(remoteRoot, '123'));
    expect(remoteEntries).toEqual([]);
  });
});
