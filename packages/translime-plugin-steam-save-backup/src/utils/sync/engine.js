import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildManifest, planSync } from './manifest';
import { isRemoteNotFound, tailOutput } from './rclone';

export class SyncCancelledError extends Error {
  constructor() {
    super('同步已取消');
    this.name = 'SyncCancelledError';
  }
}

const joinRemote = (target, ...parts) => [target.replace(/[\\/]+$/, ''), ...parts].join('/');

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

/**
 * 执行一次全量对账（docs/auto-sync-research.md §4.2）：
 * 拉取远端全部 info.json 构成远端清单 → 与本地清单比对 → 改名冲突目录 → 逐目录上传/下载。
 *
 * @param {object} options
 * @param {(args: string[], options?: {timeoutMs?: number}) => Promise<{code: number, stdout: string, stderr: string}>} options.exec rclone 执行器
 * @param {string} options.target 远程目标（rclone remote 或本地/UNC 路径）
 * @param {string} options.backupRoot 本地备份根目录
 * @param {string} options.machineId 本机标识，用于冲突目录改名后缀
 * @param {() => boolean} [options.isCancelled] 取消检查
 * @param {(progress: object) => void} [options.onProgress] 进度回调
 * @param {string} [options.stageDir] 远端 info.json 暂存目录（测试注入用，缺省临时目录）
 */
export const runSync = async ({
  exec,
  target,
  backupRoot,
  machineId,
  isCancelled = () => false,
  onProgress = () => {},
  stageDir,
}) => {
  const startedAt = new Date().toISOString();
  const perGame = {};
  const record = (gameId, key) => {
    if (!perGame[gameId]) {
      perGame[gameId] = { uploads: 0, downloads: 0, renames: 0 };
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
    const plan = planSync(localManifest, remoteManifest, machineId);

    await runSequential(plan.renames, async (rename) => {
      assertAlive();
      await fs.rename(
        path.join(backupRoot, rename.gameId, rename.from),
        path.join(backupRoot, rename.gameId, rename.to),
      );
      record(rename.gameId, 'renames');
    });

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
      totals: {
        uploads: plan.uploads.length,
        downloads: plan.downloads.length,
        renames: plan.renames.length,
      },
    };
  } finally {
    if (ownsStage) {
      await fs.rm(stage, { recursive: true, force: true });
    }
  }
};
