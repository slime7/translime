import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createArchive, extractArchive, readInfoFromArchive } from './archive';
import {
  buildManifest, buildRemoteInventory, planSync, uniqueDirName,
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

// 上传：先传 `.part` 临时名再 moveto 改名，远端只在完整时出现最终名（原子可见）
const uploadArchive = async (exec, localDir, remoteZip, tempDir) => {
  const tempZip = path.join(tempDir, `${path.basename(remoteZip)}.uploading`);
  await createArchive(localDir, tempZip);
  const partRemote = `${remoteZip}.part`;
  const partResult = await exec(['copyto', tempZip, partRemote]);
  if (partResult.code !== 0) {
    throw new Error(`上传备份失败：${tailOutput(partResult.stderr)}`);
  }
  const moveResult = await exec(['moveto', partRemote, remoteZip]);
  if (moveResult.code !== 0) {
    throw new Error(`完成备份上传失败：${tailOutput(moveResult.stderr)}`);
  }
  await fs.rm(tempZip, { force: true });
};

const downloadArchive = async (exec, remoteZip, localDir, tempDir) => {
  const tempZip = path.join(tempDir, `${path.basename(remoteZip)}.downloading`);
  const result = await exec(['copyto', remoteZip, tempZip]);
  if (result.code !== 0) {
    throw new Error(`下载备份失败：${tailOutput(result.stderr)}`);
  }
  await extractArchive(tempZip, localDir);
  await fs.rm(tempZip, { force: true });
};

// 目录格式备份的下载（仅用于 v1.5 旧格式远端的自动迁移与冲突处理；
// 目录格式上传已废弃，一律改为打包上传）
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
    throw new Error(`清理远端旧格式备份失败：${tailOutput(result.stderr)}`);
  }
};

// 串行执行异步步骤：对账按目录逐个进行（rclone 调用与取消检查必须保序），用 reduce 链表达顺序
const runSequential = (items, step) => items.reduce(
  (chain, item) => chain.then(() => step(item)),
  Promise.resolve(),
);

// 冲突展示信息：从备份元数据提取时间与来源机器（摘要差异本身即冲突依据）
const readConflictMeta = async (infoPath) => {
  try {
    const info = JSON.parse((await fs.readFile(infoPath, 'utf8')).replace(/^\uFEFF/, ''));
    return {
      backupTime: typeof info.backupTime === 'string' ? info.backupTime : null,
      createdBy: typeof info.createdBy === 'string' ? info.createdBy : null,
      gameName: typeof info.gameName === 'string' ? info.gameName : null,
    };
  } catch {
    return { backupTime: null, createdBy: null, gameName: null };
  }
};

/**
 * 执行一次全量对账（docs/auto-sync-research.md §4.2）：
 * 拉取远端全部备份元数据构成远端清单 → 与本地清单比对 → 逐备份上传/下载。
 * - 远端自 v1.6 起以单个 zip 表示一份备份（小文件多的存档目录打包传输更高效）；
 *   本地保持目录形态不变。
 * - 同名备份摘要不一致（内容分叉）不自动合并：记入报告的 conflicts 并排除在
 *   自动动作之外，由用户通过 resolveConflict 选择“覆盖本地 / 覆盖远程 / 保留两份”。
 * - v1.5 目录格式的远端备份自动迁移为 zip：需要时先取回本地，打包上传后清理
 *   旧目录；与本地内容分叉的旧目录同样走冲突确认。
 *
 * @param {object} options
 * @param {(args: string[], options?: {timeoutMs?: number}) => Promise<{code: number, stdout: string, stderr: string}>} options.exec rclone 执行器
 * @param {string} options.target 远程目标（rclone remote 或本地/UNC 路径）
 * @param {string} options.backupRoot 本地备份根目录
 * @param {() => boolean} [options.isCancelled] 取消检查
 * @param {(progress: object) => void} [options.onProgress] 进度回调
 * @param {string} [options.stageDir] 远端元数据暂存目录（测试注入用，缺省临时目录）
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
  const record = (gameId, key) => {
    if (!perGame[gameId]) {
      perGame[gameId] = {
        uploads: 0, downloads: 0, conflicts: 0, migrated: 0,
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
    // 一次拉取远端全部备份元数据：zip 整包入 stage（zip 内 info.json 无法远端过滤），
    // 旧目录格式只取 info.json
    const stageResult = await exec([
      'copy',
      target,
      stage,
      '--include',
      '/*/*/*.zip',
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

    const { zips: remoteManifest, legacy } = await buildRemoteInventory(stage);
    const localManifest = await buildManifest(backupRoot);
    const plan = planSync(localManifest, remoteManifest);

    const conflicts = [];

    // 旧目录格式 → zip 的自动迁移；与本地内容分叉的旧目录转为冲突待处理
    await runSequential(legacy, async ({ gameId, ts, digest }) => {
      assertAlive();
      const localDigest = localManifest?.[gameId]?.[ts];
      const legacyDir = joinRemote(target, gameId, ts);
      const localDir = path.join(backupRoot, gameId, ts);

      if (localDigest && localDigest !== digest) {
        const local = await readConflictMeta(path.join(backupRoot, gameId, ts, 'info.json'));
        const remote = await readConflictMeta(path.join(stage, gameId, ts, 'info.json'));
        conflicts.push({
          gameId,
          dir: ts,
          gameName: local.gameName || remote.gameName,
          remoteKind: 'dir',
          local,
          remote,
          detectedAt: new Date().toISOString(),
        });
        record(gameId, 'conflicts');
        return;
      }

      if (!localDigest) {
        onProgress({ phase: 'download', gameId, dir: ts });
        await downloadDir(exec, legacyDir, localDir);
        record(gameId, 'downloads');
      }
      onProgress({ phase: 'upload', gameId, dir: ts });
      await uploadArchive(exec, localDir, joinRemote(target, gameId, `${ts}.zip`), tempDir);
      await purgeRemote(exec, legacyDir);
      record(gameId, 'migrated');
    });

    assertAlive();

    const zipConflicts = await Promise.all(plan.conflicts.map(async ({ gameId, ts }) => {
      const local = await readConflictMeta(path.join(backupRoot, gameId, ts, 'info.json'));
      const remote = await readInfoFromArchive(path.join(stage, gameId, `${ts}.zip`)) || {};
      const remoteMeta = {
        backupTime: typeof remote.backupTime === 'string' ? remote.backupTime : null,
        createdBy: typeof remote.createdBy === 'string' ? remote.createdBy : null,
        gameName: typeof remote.gameName === 'string' ? remote.gameName : null,
      };
      record(gameId, 'conflicts');
      return {
        gameId,
        dir: ts,
        gameName: local.gameName || remoteMeta.gameName,
        remoteKind: 'zip',
        local,
        remote: remoteMeta,
        detectedAt: new Date().toISOString(),
      };
    }));
    conflicts.push(...zipConflicts);

    const total = plan.uploads.length + plan.downloads.length;
    let done = 0;

    await runSequential(plan.uploads, async (upload) => {
      assertAlive();
      onProgress({
        phase: 'upload', done, total, gameId: upload.gameId, dir: upload.ts,
      });
      await uploadArchive(
        exec,
        path.join(backupRoot, upload.gameId, upload.ts),
        joinRemote(target, upload.gameId, `${upload.ts}.zip`),
        tempDir,
      );
      record(upload.gameId, 'uploads');
      done += 1;
    });

    await runSequential(plan.downloads, async (download) => {
      assertAlive();
      onProgress({
        phase: 'download', done, total, gameId: download.gameId, dir: download.ts,
      });
      await downloadArchive(
        exec,
        joinRemote(target, download.gameId, `${download.ts}.zip`),
        path.join(backupRoot, download.gameId, download.ts),
        tempDir,
      );
      record(download.gameId, 'downloads');
      done += 1;
    });

    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: true,
      perGame,
      conflicts,
      totals: {
        uploads: plan.uploads.length,
        downloads: plan.downloads.length,
        conflicts: plan.conflicts.length,
        migrated: legacy.length - conflicts.filter((item) => item.remoteKind === 'dir').length,
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

/**
 * 处理单个同步冲突（Steam Cloud 式三选一）：
 * - overwrite-local：以远程为准，删除本地版本后回补下载
 * - overwrite-remote：以本地为准，本地版本打包上传覆盖远程
 * - keep-both：本地版本改名 `<dir>-<machineId>` 保留并上传，远程原件回补下载
 * 远程为旧目录格式时，处理完成后迁移为 zip 并清理旧目录。
 *
 * @param {object} options
 * @param {string} options.mode 'overwrite-local' | 'overwrite-remote' | 'keep-both'
 * @param {string} options.machineId 本机标识（keep-both 改名后缀）
 * @param {string} [options.remoteKind] 远端条目格式 'zip' | 'dir'
 * @param {string[]} [options.existingNames] 远端已存在的条目名（缺省时自动列举）
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
  const remoteZip = joinRemote(target, String(gameId), `${dir}.zip`);
  const legacyDir = joinRemote(target, String(gameId), dir);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'translime-sync-zip-'));
  const assertAlive = () => {
    if (isCancelled()) {
      throw new SyncCancelledError();
    }
  };

  try {
    assertAlive();

    if (mode === 'overwrite-local') {
      await fs.rm(localDir, { recursive: true, force: true });
      if (remoteKind === 'dir') {
        await downloadDir(exec, legacyDir, localDir);
        await uploadArchive(exec, localDir, remoteZip, tempDir);
        await purgeRemote(exec, legacyDir);
      } else {
        await downloadArchive(exec, remoteZip, localDir, tempDir);
      }
      return { mode };
    }

    if (mode === 'overwrite-remote') {
      await uploadArchive(exec, localDir, remoteZip, tempDir);
      if (remoteKind === 'dir') {
        await purgeRemote(exec, legacyDir);
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
        if (remoteKind === 'dir') {
          await downloadDir(exec, legacyDir, localDir);
        } else {
          await downloadArchive(exec, remoteZip, localDir, tempDir);
        }
        await uploadArchive(exec, renamedDir, joinRemote(target, String(gameId), `${newName}.zip`), tempDir);
      } catch (e) {
        // 失败时还原本地目录名（下载已重建的原件让位），冲突保持未处理状态等待重试
        await fs.rm(localDir, { recursive: true, force: true }).catch(() => {});
        await fs.rename(renamedDir, localDir).catch(() => {});
        throw e;
      }
      if (remoteKind === 'dir') {
        await purgeRemote(exec, legacyDir);
      }
      return { mode, renamedTo: newName };
    }

    throw new Error(`未知的冲突处理方式：${mode}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

/**
 * 删除远端的一份备份（zip 与旧目录格式都清理；条目不存在视为已删除）。
 * 用于“同时删除远程存档”。
 */
export const deleteRemoteBackup = async (exec, target, gameId, dir) => {
  await purgeRemote(exec, joinRemote(target, String(gameId), `${dir}.zip`));
  await purgeRemote(exec, joinRemote(target, String(gameId), dir));
};
