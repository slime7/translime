import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildManifest, planSync, uniqueDirName } from './manifest';
import { isRemoteNotFound, tailOutput } from './rclone';

export class SyncCancelledError extends Error {
  constructor() {
    super('同步已取消');
    this.name = 'SyncCancelledError';
  }
}

const joinRemote = (target, ...parts) => [target.replace(/[\\/]+$/, ''), ...parts].join('/');

const machineSuffix = (machineId) => String(machineId || '').slice(0, 8) || 'local';

// 数据文件先传，info.json 收尾写入：远端目录只要存在 info.json 即视为完整（研究方案 §4.1）
const uploadDir = async (exec, localDir, remoteDir) => {
  const dataResult = await exec(['copy', localDir, remoteDir, '--exclude', 'info.json']);
  if (dataResult.code !== 0) {
    throw new Error(`上传备份失败：${tailOutput(dataResult.stderr)}`);
  }
  const infoResult = await exec(['copyto', path.join(localDir, 'info.json'), `${remoteDir}/info.json`]);
  if (infoResult.code !== 0) {
    throw new Error(`上传备份元数据失败：${tailOutput(infoResult.stderr)}`);
  }
};

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

// 串行执行异步步骤：对账按目录逐个进行（rclone 调用与取消检查必须保序），用 reduce 链表达顺序
const runSequential = (items, step) => items.reduce(
  (chain, item) => chain.then(() => step(item)),
  Promise.resolve(),
);

// 冲突展示信息：从两端 info.json 提取时间与来源机器（摘要差异本身即冲突依据）
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
 * 拉取远端全部 info.json 构成远端清单 → 与本地清单比对 → 逐目录上传/下载。
 * 同名目录摘要不一致（内容分叉）不自动合并：记入报告的 conflicts 并排除在自动动作之外，
 * 由用户通过 resolveConflict 选择“覆盖本地 / 覆盖远程 / 保留两份”。
 *
 * @param {object} options
 * @param {(args: string[], options?: {timeoutMs?: number}) => Promise<{code: number, stdout: string, stderr: string}>} options.exec rclone 执行器
 * @param {string} options.target 远程目标（rclone remote 或本地/UNC 路径）
 * @param {string} options.backupRoot 本地备份根目录
 * @param {() => boolean} [options.isCancelled] 取消检查
 * @param {(progress: object) => void} [options.onProgress] 进度回调
 * @param {string} [options.stageDir] 远端 info.json 暂存目录（测试注入用，缺省临时目录）
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
      perGame[gameId] = { uploads: 0, downloads: 0, conflicts: 0 };
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
  try {
    assertAlive();
    // 一次拉取远端全部 info.json：既验证目标可达，也构成远端清单（缺 info.json 的目录不在清单内）
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

    const remoteManifest = remoteMissing ? {} : await buildManifest(stage);
    const localManifest = await buildManifest(backupRoot);
    const plan = planSync(localManifest, remoteManifest);

    const conflicts = await Promise.all(plan.conflicts.map(async ({ gameId, ts }) => {
      const local = await readConflictMeta(path.join(backupRoot, gameId, ts, 'info.json'));
      const remote = await readConflictMeta(path.join(stage, gameId, ts, 'info.json'));
      record(gameId, 'conflicts');
      return {
        gameId,
        dir: ts,
        gameName: local.gameName || remote.gameName,
        local,
        remote,
        detectedAt: new Date().toISOString(),
      };
    }));

    const total = plan.uploads.length + plan.downloads.length;
    let done = 0;

    await runSequential(plan.uploads, async (upload) => {
      assertAlive();
      onProgress({
        phase: 'upload', done, total, gameId: upload.gameId, dir: upload.ts,
      });
      await uploadDir(
        exec,
        path.join(backupRoot, upload.gameId, upload.ts),
        joinRemote(target, upload.gameId, upload.ts),
      );
      record(upload.gameId, 'uploads');
      done += 1;
    });

    await runSequential(plan.downloads, async (download) => {
      assertAlive();
      onProgress({
        phase: 'download', done, total, gameId: download.gameId, dir: download.ts,
      });
      await downloadDir(
        exec,
        joinRemote(target, download.gameId, download.ts),
        path.join(backupRoot, download.gameId, download.ts),
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
      },
    };
  } finally {
    if (ownsStage) {
      await fs.rm(stage, { recursive: true, force: true });
    }
  }
};

/**
 * 列出远端某游戏目录下的备份目录名（keep-both 改名时避免与远端既有目录撞名）
 */
export const listRemoteGameDirs = async (exec, target, gameId) => {
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
 * - overwrite-remote：以本地为准，本地版本上传覆盖远程
 * - keep-both：本地版本改名 `<dir>-<machineId>` 保留并上传，远程原件回补下载
 *
 * @param {object} options
 * @param {string} options.mode 'overwrite-local' | 'overwrite-remote' | 'keep-both'
 * @param {string} options.machineId 本机标识（keep-both 改名后缀）
 * @param {string[]} [options.existingNames] 远端已存在的目录名（缺省时自动列举）
 */
export const resolveConflict = async ({
  exec,
  target,
  backupRoot,
  gameId,
  dir,
  mode,
  machineId,
  existingNames,
  isCancelled = () => false,
}) => {
  const localDir = path.join(backupRoot, String(gameId), dir);
  const remoteDir = joinRemote(target, String(gameId), dir);
  const assertAlive = () => {
    if (isCancelled()) {
      throw new SyncCancelledError();
    }
  };
  assertAlive();

  if (mode === 'overwrite-local') {
    await fs.rm(localDir, { recursive: true, force: true });
    await downloadDir(exec, remoteDir, localDir);
    return { mode };
  }

  if (mode === 'overwrite-remote') {
    await uploadDir(exec, localDir, remoteDir);
    return { mode };
  }

  if (mode === 'keep-both') {
    const remoteNames = existingNames || await listRemoteGameDirs(exec, target, String(gameId));
    const localDirs = await fs.readdir(path.join(backupRoot, String(gameId))).catch(() => []);
    const taken = new Set([...remoteNames, ...localDirs, dir]);
    const newName = uniqueDirName(`${dir}-${machineSuffix(machineId)}`, taken);
    const renamedDir = path.join(backupRoot, String(gameId), newName);

    await fs.rename(localDir, renamedDir);
    try {
      await uploadDir(exec, renamedDir, joinRemote(target, String(gameId), newName));
    } catch (e) {
      // 上传失败时还原本地目录名，冲突保持未处理状态等待重试
      await fs.rename(renamedDir, localDir).catch(() => {});
      throw e;
    }
    await downloadDir(exec, remoteDir, localDir);
    return { mode, renamedTo: newName };
  }

  throw new Error(`未知的冲突处理方式：${mode}`);
};
