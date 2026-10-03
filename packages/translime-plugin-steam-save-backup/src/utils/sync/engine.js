import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeJson } from '../fs-wrapper';
import { createArchive, extractArchive } from './archive';
import {
  buildManifest, collectManifestDetails, planSync, uniqueDirName,
} from './manifest';
import { isRemoteNotFound, tailOutput } from './rclone';

export class SyncCancelledError extends Error {
  constructor() {
    super('同步已取消');
    this.name = 'SyncCancelledError';
  }
}

const joinRemote = (target, ...parts) => [target.replace(/[\\/]+$/, ''), ...parts].join('/');

const machineSuffix = (machineId) => String(machineId || '').slice(0, 8) || 'local';

// 远端一份备份 = <gameId>/<时间戳>/ 目录下的 data.zip（不含 info.json）与 info.json：
// 元数据外置后对账只需拉取各备份的 info.json，不解包即可比对摘要。
// 数据包先传（.part → moveto 原子可见），info.json 收尾写入；完整备份以包含 info.json 为准
const uploadBackup = async (exec, localDir, remoteDir, tempDir) => {
  const tempZip = path.join(tempDir, `${path.basename(remoteDir)}.uploading`);
  await createArchive(localDir, tempZip, { excludeInfo: true });
  const partRemote = `${remoteDir}/data.zip.part`;
  const partResult = await exec(['copyto', tempZip, partRemote]);
  if (partResult.code !== 0) {
    throw new Error(`上传备份失败：${tailOutput(partResult.stderr)}`);
  }
  const moveResult = await exec(['moveto', partRemote, `${remoteDir}/data.zip`]);
  if (moveResult.code !== 0) {
    throw new Error(`完成备份上传失败：${tailOutput(moveResult.stderr)}`);
  }
  await fs.rm(tempZip, { force: true });
  const infoResult = await exec(['copyto', path.join(localDir, 'info.json'), `${remoteDir}/info.json`]);
  if (infoResult.code !== 0) {
    throw new Error(`上传备份元数据失败：${tailOutput(infoResult.stderr)}`);
  }
};

const downloadBackup = async (exec, remoteDir, localDir, tempDir) => {
  const tempZip = path.join(tempDir, `${path.basename(remoteDir)}.downloading`);
  const result = await exec(['copyto', `${remoteDir}/data.zip`, tempZip]);
  if (result.code !== 0) {
    throw new Error(`下载备份失败：${tailOutput(result.stderr)}`);
  }
  await extractArchive(tempZip, localDir);
  await fs.rm(tempZip, { force: true });
  const infoResult = await exec(['copyto', `${remoteDir}/info.json`, path.join(localDir, 'info.json')]);
  if (infoResult.code !== 0) {
    throw new Error(`下载备份元数据失败：${tailOutput(infoResult.stderr)}`);
  }
};

// 下载散文件目录形态的远端备份
const downloadDir = async (exec, remoteDir, localDir) => {
  const dataResult = await exec(['copy', remoteDir, localDir, '--exclude', 'info.json']);
  if (dataResult.code !== 0) {
    throw new Error(`下载备份失败：${tailOutput(dataResult.stderr)}`);
  }
  const infoResult = await exec(['copyto', `${remoteDir}/info.json`, path.join(localDir, 'info.json')]);
  if (infoResult.code !== 0) {
    throw new Error(`下载备份元数据失败：${tailOutput(infoResult.stderr)}`);
  }
};

const purgeRemote = async (exec, remotePath) => {
  const result = await exec(['purge', remotePath]);
  if (result.code !== 0 && !isRemoteNotFound(result)) {
    throw new Error(`清理远端路径失败：${tailOutput(result.stderr)}`);
  }
};

// 递归列举远端目录下全部文件名（不含内容，开销极小），目录不存在返回空
const listRemoteFiles = async (exec, remoteDir) => {
  const result = await exec(['lsf', remoteDir, '-R', '--files-only']);
  if (result.code !== 0) {
    if (isRemoteNotFound(result)) {
      return [];
    }
    throw new Error(`读取远端目录失败：${tailOutput(result.stderr)}`);
  }
  return (result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\\/g, '/'))
    .filter(Boolean);
};

// 从文件名列表归纳每个备份目录的形态：是否已有 data.zip（数据包）、
// 除 info.json / data.zip 外还残留哪些顶层子目录（散文件数据目录或中断残留）
const describeGameEntries = (files) => {
  const entries = {};
  files.forEach((rel) => {
    const slash = rel.indexOf('/');
    if (slash <= 0) {
      return;
    }
    const ts = rel.slice(0, slash);
    const child = rel.slice(slash + 1);
    const entry = entries[ts] || (entries[ts] = { hasZip: false, legacyChildren: new Set() });
    if (child === 'data.zip') {
      entry.hasZip = true;
      return;
    }
    if (child !== 'info.json') {
      entry.legacyChildren.add(child.split('/')[0]);
    }
  });
  return entries;
};

// 串行执行异步步骤：对账按目录逐个进行（rclone 调用与取消检查必须保序），用 reduce 链表达顺序
const runSequential = (items, step) => items.reduce(
  (chain, item) => chain.then(() => step(item)),
  Promise.resolve(),
);

// 冲突展示信息：从备份元数据提取时间与来源机器（摘要差异本身即冲突依据）；
// deleted* 字段用于识别远端删除墓碑
const readConflictMeta = async (infoPath) => {
  try {
    const info = JSON.parse((await fs.readFile(infoPath, 'utf8')).replace(/^\uFEFF/, ''));
    return {
      backupTime: typeof info.backupTime === 'string' ? info.backupTime : null,
      createdBy: typeof info.createdBy === 'string' ? info.createdBy : null,
      gameName: typeof info.gameName === 'string' ? info.gameName : null,
      deleted: Boolean(info.deleted),
      deletedAt: typeof info.deletedAt === 'string' ? info.deletedAt : null,
      deletedBy: typeof info.deletedBy === 'string' ? info.deletedBy : null,
    };
  } catch {
    return {
      backupTime: null,
      createdBy: null,
      gameName: null,
      deleted: false,
      deletedAt: null,
      deletedBy: null,
    };
  }
};

/**
 * 执行全量对账：
 * 拉取远端全部 info.json 构成远端清单，与本地比对后执行上传与下载。
 * - 远端备份由 data.zip 与独立 info.json 组成，本地保持目录形态不变；仅在需要下载时传输数据包。
 * - 同名备份摘要不一致时记录为冲突，由用户选择覆盖本地、覆盖远程或保留两份。
 * - 远端删除墓碑（info.json 带 deleted 标记）：本地副本自动跟随删除并计入报告；
 *   本地在删除时间点之后仍有更新的转墓碑冲突待确认；本地缺失时不回补。
 * - 远端散文件备份（data_N）在对账时自动迁移为数据包，内容分叉同样走冲突确认。
 *
 * @param {object} options
 * @param {(args: string[], options?: {timeoutMs?: number}) => Promise<{code: number, stdout: string, stderr: string}>} options.exec rclone 执行器
 * @param {string} options.target 远程目标（rclone remote 或本地/UNC 路径）
 * @param {string} options.backupRoot 本地备份根目录
 * @param {() => boolean} [options.isCancelled] 取消检查
 * @param {(progress: object) => void} [options.onProgress] 进度回调
 * @param {string} [options.stageDir] 远端元数据暂存目录（测试注入用，默认使用临时目录）
 */
export const runSync = async ({
  exec,
  target,
  backupRoot,
  isCancelled = () => false,
  onProgress = () => {},
  stageDir,
}) => {
  const startedAt = new Date().toISOString();
  const perGame = {};
  let migratedCount = 0;
  const record = (gameId, key) => {
    if (!perGame[gameId]) {
      perGame[gameId] = {
        uploads: 0, downloads: 0, conflicts: 0, deletions: 0, migrated: 0,
      };
    }
    perGame[gameId][key] += 1;
  };
  const assertAlive = () => {
    if (isCancelled()) {
      throw new SyncCancelledError();
    }
  };

  const ownsStage = !stageDir;
  const stage = stageDir || await fs.mkdtemp(path.join(os.tmpdir(), 'translime-sync-'));
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'translime-sync-zip-'));
  try {
    assertAlive();
    // 一次拉取远端全部备份元数据：info.json 每份几 KB，构成清单即足够对账
    const stageResult = await exec([
      'copy',
      target,
      stage,
      '--include',
      '/*/*/info.json',
      '--transfers',
      '8',
      '--contimeout',
      '20s',
    ]);
    const remoteMissing = isRemoteNotFound(stageResult);
    if (stageResult.code !== 0 && !remoteMissing) {
      throw new Error(`读取远端清单失败：${tailOutput(stageResult.stderr)}`);
    }
    assertAlive();

    const remoteDetails = await collectManifestDetails(stage);
    const remoteManifest = remoteDetails.manifest;
    const { tombstones } = remoteDetails;
    const localManifest = await buildManifest(backupRoot);
    const plan = planSync(localManifest, remoteManifest, tombstones);

    // 远端已删除（墓碑）的备份：结合本地 backupTime 与 deletedAt 判定
    // 「跟随删除并通知」或「删除冲突待确认」；本地缺失时不做任何动作（不回补）
    const appliedDeletions = [];
    const tombstoneConflicts = [];
    await runSequential(plan.deletions, async ({ gameId, ts }) => {
      assertAlive();
      const tomb = tombstones[gameId]?.[ts] || {};
      const localDir = path.join(backupRoot, gameId, ts);
      const localMeta = await readConflictMeta(path.join(localDir, 'info.json'));
      const deletedAtMs = Date.parse(tomb.deletedAt || '');
      const backupTimeMs = Date.parse(localMeta.backupTime || '');
      const shouldApply = !Number.isNaN(deletedAtMs) && !Number.isNaN(backupTimeMs)
        && backupTimeMs <= deletedAtMs;
      if (!shouldApply) {
        // 删除时间不可知，或删除决定之后本端又生成过该备份：不自动删，转墓碑冲突
        record(gameId, 'conflicts');
        tombstoneConflicts.push({
          gameId,
          dir: ts,
          kind: 'tombstone',
          gameName: localMeta.gameName,
          remoteKind: 'zip',
          local: localMeta,
          remote: { deletedAt: tomb.deletedAt, deletedBy: tomb.deletedBy || null },
          detectedAt: new Date().toISOString(),
        });
        return;
      }
      onProgress({ phase: 'delete', gameId, dir: ts });
      await fs.rm(localDir, { recursive: true, force: true });
      appliedDeletions.push({ gameId, dir: ts, gameName: localMeta.gameName });
      record(gameId, 'deletions');
    });

    // 每个远端游戏一次递归文件名列举，识别数据包与散文件目录形态并收集散文件残留子目录
    // （全部条目均为墓碑的游戏没有数据形态可言，跳过列举）
    const gameEntryMap = {};
    const activeGameIds = Object.keys(remoteManifest).filter((gameId) => (
      Object.keys(remoteManifest[gameId]).some((ts) => !tombstones[gameId]?.[ts])
    ));
    await Promise.all(activeGameIds.map(async (gameId) => {
      const files = await listRemoteFiles(exec, joinRemote(target, gameId));
      gameEntryMap[gameId] = describeGameEntries(files);
    }));
    assertAlive();

    const conflicts = await Promise.all(plan.conflicts.map(async ({ gameId, ts }) => {
      const local = await readConflictMeta(path.join(backupRoot, gameId, ts, 'info.json'));
      const remote = await readConflictMeta(path.join(stage, gameId, ts, 'info.json'));
      record(gameId, 'conflicts');
      return {
        gameId,
        dir: ts,
        gameName: local.gameName || remote.gameName,
        remoteKind: gameEntryMap[gameId]?.[ts]?.hasZip ? 'zip' : 'dir',
        local,
        remote,
        detectedAt: new Date().toISOString(),
      };
    }));
    conflicts.push(...tombstoneConflicts);

    // 同名同摘要的散文件目录 → 迁移为数据包；分叉的散文件目录保持冲突待处理，不做迁移
    const legacySame = [];
    Object.keys(remoteManifest).forEach((gameId) => {
      Object.keys(remoteManifest[gameId]).forEach((ts) => {
        if (tombstones[gameId]?.[ts]) {
          return;
        }
        if (gameEntryMap[gameId]?.[ts]?.hasZip) {
          return;
        }
        const localDigest = localManifest?.[gameId]?.[ts];
        if (localDigest && localDigest === remoteManifest[gameId][ts]) {
          legacySame.push({ gameId, ts });
        }
      });
    });

    const migrateLegacy = async ({ gameId, ts }) => {
      const localDir = path.join(backupRoot, gameId, ts);
      const remoteDir = joinRemote(target, gameId, ts);
      onProgress({ phase: 'upload', gameId, dir: ts });
      await uploadBackup(exec, localDir, remoteDir, tempDir);
      const staleChildren = [...(gameEntryMap[gameId]?.[ts]?.legacyChildren || [])];
      await runSequential(staleChildren, (child) => purgeRemote(exec, `${remoteDir}/${child}`));
      migratedCount += 1;
      record(gameId, 'migrated');
    };
    await runSequential(legacySame, migrateLegacy);

    const total = plan.uploads.length + plan.downloads.length;
    let done = 0;

    await runSequential(plan.downloads, async (download) => {
      assertAlive();
      onProgress({
        phase: 'download', done, total, gameId: download.gameId, dir: download.ts,
      });
      const localDir = path.join(backupRoot, download.gameId, download.ts);
      const remoteDir = joinRemote(target, download.gameId, download.ts);
      if (gameEntryMap[download.gameId]?.[download.ts]?.hasZip) {
        await downloadBackup(exec, remoteDir, localDir, tempDir);
      } else {
        // 散文件目录形态：取回后立即迁移为数据包，远端不保留散文件形态
        await downloadDir(exec, remoteDir, localDir);
        record(download.gameId, 'downloads');
        done += 1;
        await migrateLegacy({ gameId: download.gameId, ts: download.ts });
        return;
      }
      record(download.gameId, 'downloads');
      done += 1;
    });

    await runSequential(plan.uploads, async (upload) => {
      assertAlive();
      onProgress({
        phase: 'upload', done, total, gameId: upload.gameId, dir: upload.ts,
      });
      await uploadBackup(
        exec,
        path.join(backupRoot, upload.gameId, upload.ts),
        joinRemote(target, upload.gameId, upload.ts),
        tempDir,
      );
      record(upload.gameId, 'uploads');
      done += 1;
    });

    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: true,
      perGame,
      conflicts,
      deletions: appliedDeletions,
      totals: {
        uploads: plan.uploads.length,
        downloads: plan.downloads.length,
        conflicts: plan.conflicts.length + tombstoneConflicts.length,
        deletions: appliedDeletions.length,
        migrated: migratedCount,
      },
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
    if (ownsStage) {
      await fs.rm(stage, { recursive: true, force: true });
    }
  }
};

/**
 * 列出远端某游戏目录下的条目名（keep-both 改名时避免与远端既有备份撞名）
 */
export const listRemoteGameEntries = async (exec, target, gameId) => {
  const result = await exec(['lsf', joinRemote(target, gameId), '--dirs-only']);
  if (result.code !== 0) {
    throw new Error(`读取远端目录失败：${tailOutput(result.stderr)}`);
  }
  return (result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\/+$/, ''))
    .filter(Boolean);
};

// 清理远端备份目录里除 info.json / data.zip 外的残留子目录（散文件数据目录等）
const purgeStaleChildren = async (exec, remoteDir) => {
  const children = new Set();
  (await listRemoteFiles(exec, remoteDir)).forEach((rel) => {
    const top = rel.split('/')[0];
    if (top && top !== 'info.json' && top !== 'data.zip') {
      children.add(top);
    }
  });
  await runSequential([...children], (child) => purgeRemote(exec, `${remoteDir}/${child}`));
};

/**
 * 处理单个同步冲突（Steam Cloud 式三选一）：
 * - overwrite-local：以远程为准，删除本地版本后回补下载
 * - overwrite-remote：以本地为准，本地版本打包上传覆盖远程（散文件残留一并清理）
 * - keep-both：本地版本改名 `<dir>-<machineId>` 保留并上传，远程原件回补下载
 *   （远端散文件原件不在此处迁移，下次对账自动转为数据包）
 *
 * @param {object} options
 * @param {string} options.mode 'overwrite-local' | 'overwrite-remote' | 'keep-both'
 * @param {string} options.machineId 本机标识（keep-both 改名后缀）
 * @param {string} [options.remoteKind] 远端条目形态 'zip'（数据包）| 'dir'（散文件目录）
 * @param {string[]} [options.existingNames] 远端已存在的条目名（未指定时自动列举）
 */
export const resolveConflict = async ({
  exec,
  target,
  backupRoot,
  gameId,
  dir,
  mode,
  machineId,
  remoteKind = 'zip',
  existingNames,
  isCancelled = () => false,
}) => {
  const gameDir = path.join(backupRoot, String(gameId));
  const localDir = path.join(gameDir, dir);
  const remoteDir = joinRemote(target, String(gameId), dir);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'translime-sync-zip-'));
  const assertAlive = () => {
    if (isCancelled()) {
      throw new SyncCancelledError();
    }
  };
  const downloadRemote = () => (remoteKind === 'dir'
    ? downloadDir(exec, remoteDir, localDir)
    : downloadBackup(exec, remoteDir, localDir, tempDir));

  try {
    assertAlive();

    if (mode === 'overwrite-local') {
      await fs.rm(localDir, { recursive: true, force: true });
      await downloadRemote();
      return { mode };
    }

    if (mode === 'overwrite-remote') {
      await uploadBackup(exec, localDir, remoteDir, tempDir);
      if (remoteKind === 'dir') {
        await purgeStaleChildren(exec, remoteDir);
      }
      return { mode };
    }

    if (mode === 'keep-both') {
      const remoteNames = existingNames || await listRemoteGameEntries(exec, target, String(gameId));
      const localDirs = await fs.readdir(gameDir).catch(() => []);
      const taken = new Set([...remoteNames, ...localDirs, dir]);
      const newName = uniqueDirName(`${dir}-${machineSuffix(machineId)}`, taken);
      const renamedDir = path.join(gameDir, newName);

      // 先改名保留本地版本，再回补下载远程原件（顺序不能反，否则下载会覆盖本地分叉副本）
      await fs.rename(localDir, renamedDir);
      try {
        await downloadRemote();
        await uploadBackup(exec, renamedDir, joinRemote(target, String(gameId), newName), tempDir);
      } catch (e) {
        // 失败时还原本地目录名（下载已重建的原件让位），冲突保持未处理状态等待重试
        await fs.rm(localDir, { recursive: true, force: true }).catch(() => {});
        await fs.rename(renamedDir, localDir).catch(() => {});
        throw e;
      }
      return { mode, renamedTo: newName };
    }

    throw new Error(`未知的冲突处理方式：${mode}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

/**
 * 删除远端的一份备份（「同时删除远程存档」）。
 * 数据文件整体清理，但保留 info.json 并追加删除标记（墓碑）：
 * 其他端对账时据此删除本地副本并跳过回补，防止仍持有该备份的端把它重新推上远端。
 * 条目不存在视为已删除（仍写入墓碑，传播删除意图）。
 *
 * @param {object} [options.tombstoneInfo] 墓碑元数据（buildTombstoneInfo 构造，含原备份信息）
 * @param {string} [options.tempDir] 墓碑文件暂存目录
 */
export const deleteRemoteBackup = async (exec, target, gameId, dir, { tombstoneInfo = null, tempDir } = {}) => {
  const remoteDir = joinRemote(target, String(gameId), dir);
  await purgeRemote(exec, remoteDir);
  if (tombstoneInfo && tempDir) {
    const tombFile = path.join(tempDir, `${String(dir)}.deleted.json`);
    await writeJson(tombFile, tombstoneInfo);
    try {
      const result = await exec(['copyto', tombFile, `${remoteDir}/info.json`]);
      if (result.code !== 0) {
        throw new Error(`写入远端删除标记失败：${tailOutput(result.stderr)}`);
      }
    } finally {
      await fs.rm(tombFile, { force: true });
    }
  }
};
