import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ensureDir, pathExists, readJson, remove, writeJson,
} from '../fs-wrapper';
import { isRemoteNotFound, tailOutput } from '../sync/rclone';
import { SyncCancelledError } from '../sync/engine';
import {
  createMeta,
  joinRemoteEntry,
  joinRemoteMeta,
  joinRemotePassthroughRoot,
  markMetaDeleted,
  META_DIR,
  META_NAME,
  parseMeta,
} from './meta';
import planPassthroughEntry from './plan';

// 单条目本地扫描规模上限：mtime 采样与首拉保护，防止把整个盘符当存档目录
const MAX_SCAN_FILES = 2000;

/**
 * 采集本地目录状态（存在性 + 最新文件 mtime），供对账计划判断
 * “本地是否在远端删除之后仍有过更新”。
 */
export const collectLocalState = async (dir) => {
  if (!(await pathExists(dir))) {
    return { exists: false, newestMtime: null };
  }
  let newestMtime = null;
  let count = 0;
  const walk = async (current) => {
    if (count >= MAX_SCAN_FILES) {
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(entries.map(async (entry) => {
      if (count >= MAX_SCAN_FILES) {
        return;
      }
      const full = path.join(current, entry.name);
      if (entry.isFile()) {
        count += 1;
        try {
          const stats = await fs.stat(full);
          if (newestMtime == null || stats.mtimeMs > newestMtime) {
            newestMtime = stats.mtimeMs;
          }
        } catch {
          // 文件恰好被删除：跳过
        }
        return;
      }
      if (entry.isDirectory()) {
        await walk(full);
      }
    }));
  };
  await walk(dir);
  return { exists: true, newestMtime };
};

const excludeMetaArgs = ['--exclude', `${META_DIR}/**`];

/** 生成并把最新的非删除 meta 写到远端（数据先行、meta 收尾，与备份上传约定一致） */
const writeRemoteMeta = async (exec, target, { entryId, name, machineId }, tempDir) => {
  const metaFile = path.join(tempDir, `${entryId}.meta.json`);
  await writeJson(metaFile, createMeta({
    entryId, name, machineId, at: new Date().toISOString(),
  }));
  const result = await exec(['copyto', metaFile, joinRemoteMeta(target, entryId)]);
  if (result.code !== 0) {
    throw new Error(`写入直通远端元数据失败：${tailOutput(result.stderr)}`);
  }
};

/**
 * 直通云存档对账：镜像当前存档目录到远端（双向增量，较新者胜），并处理远端删除墓碑。
 * 与备份对账共用 rclone exec 与串行队列；远端布局 `<target>/passthrough/<entryId>/`。
 *
 * @param {object} options
 * @param {(args: string[], options?: object) => Promise<{code: number, stdout: string, stderr: string}>} options.exec rclone 执行器
 * @param {string} options.target 远程目标
 * @param {Array<{entryId: string, name: string, dir: string}>} options.entries 直通条目
 * @param {string} options.machineId 本机标识（写入 meta 的 updatedBy）
 * @param {() => boolean} [options.isCancelled] 取消检查
 * @param {string} [options.stageDir] 远端 meta 暂存目录（测试注入用）
 * @param {(info: object) => void} [options.onEntry] 每条目动作回调（驱动通知与抑制窗口）
 * @param {(dir: string) => void} [options.beforeWrite] 条目开始回写本地前的钩子（监控抑制）
 * @param {(dir: string) => void} [options.afterWrite] 条目回写结束后的钩子（解除抑制）
 */
// 串行执行异步步骤：对账按条目逐个进行（rclone 调用与取消检查必须保序），用 reduce 链表达顺序
const runSequential = (items, step) => items.reduce(
  (chain, item) => chain.then(() => step(item)),
  Promise.resolve(),
);

// 单条目对账：按计划分类执行删除跟随 / 冲突登记 / 跳过 / 双向增量同步
const processEntry = async ({
  exec, target, entry, stage, tempDir, machineId, report, onEntry, beforeWrite, afterWrite,
}) => {
  const { entryId, name, dir } = entry;
  let remoteMeta = null;
  try {
    remoteMeta = parseMeta(await readJson(path.join(stage, entryId, META_DIR, META_NAME)));
  } catch {
    remoteMeta = null;
  }
  const localState = await collectLocalState(dir);
  const plan = planPassthroughEntry({
    remoteMeta,
    localExists: localState.exists,
    localNewestMtime: localState.newestMtime,
  });

  if (plan.action === 'apply-deletion') {
    // 远端已删除且本地在删除后无更新：跟随删除并通知（UI 关闭时仅落状态）
    await remove(dir);
    report.appliedDeletions.push({ entryId, name });
    onEntry({ entry, action: 'apply-deletion' });
    return;
  }
  if (plan.action === 'deletion-conflict') {
    report.conflicts.push({
      entryId, name, detectedAt: new Date().toISOString(),
    });
    onEntry({ entry, action: 'deletion-conflict' });
    return;
  }
  if (plan.action === 'local-missing' || plan.action === 'noop') {
    report.skipped.push({
      entryId, name, reason: plan.action,
    });
    onEntry({ entry, action: plan.action });
    return;
  }

  // sync：双向增量；--update 只覆盖较新一方，两端同时编辑时较新者胜
  try {
    beforeWrite(dir);
    await ensureDir(dir);
    const remoteEntry = joinRemoteEntry(target, entryId);
    const down = await exec(['copy', remoteEntry, dir, '--update', ...excludeMetaArgs]);
    if (down.code !== 0 && !isRemoteNotFound(down)) {
      throw new Error(`下载直通存档失败：${tailOutput(down.stderr)}`);
    }
    const up = await exec(['copy', dir, remoteEntry, '--update', ...excludeMetaArgs]);
    if (up.code !== 0) {
      throw new Error(`上传直通存档失败：${tailOutput(up.stderr)}`);
    }
    await writeRemoteMeta(exec, target, {
      entryId, name, machineId,
    }, tempDir);
    report.updated.push({ entryId, name });
    onEntry({ entry, action: 'synced' });
  } catch (e) {
    report.errors.push({
      entryId, name, message: e.message,
    });
    onEntry({ entry, action: 'error', message: e.message });
  } finally {
    afterWrite(dir);
  }
};

export const runPassthroughSync = async ({
  exec,
  target,
  entries,
  machineId,
  isCancelled = () => false,
  stageDir,
  onEntry = () => {},
  beforeWrite = () => {},
  afterWrite = () => {},
}) => {
  const startedAt = new Date().toISOString();
  const assertAlive = () => {
    if (isCancelled()) {
      throw new SyncCancelledError();
    }
  };
  const ownsStage = !stageDir;
  const stage = stageDir || await fs.mkdtemp(path.join(os.tmpdir(), 'translime-pt-stage-'));
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'translime-pt-meta-'));
  const report = {
    appliedDeletions: [],
    conflicts: [],
    updated: [],
    skipped: [],
    errors: [],
  };
  try {
    assertAlive();
    // 一次拉取全部远端条目 meta（每条几 KB）；远端尚无 passthrough 目录视为全空
    const stageResult = await exec([
      'copy',
      joinRemotePassthroughRoot(target),
      stage,
      '--include',
      `*/${META_DIR}/${META_NAME}`,
      '--transfers',
      '8',
      '--contimeout',
      '20s',
    ]);
    if (stageResult.code !== 0 && !isRemoteNotFound(stageResult)) {
      throw new Error(`读取直通远端元数据失败：${tailOutput(stageResult.stderr)}`);
    }

    await runSequential(entries, (entry) => {
      assertAlive();
      return processEntry({
        exec, target, entry, stage, tempDir, machineId, report, onEntry, beforeWrite, afterWrite,
      });
    });

    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: true,
      ...report,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
    if (ownsStage) {
      await fs.rm(stage, { recursive: true, force: true });
    }
  }
};

/**
 * 删除远端直通条目数据并写入墓碑 meta（「同时删除远程」）。
 * 条目不存在视为已删除：仍写入墓碑，向其他端传播删除意图。
 */
export const deletePassthroughRemote = async (
  exec,
  target,
  {
    entryId, name, machineId, tombstoneAt,
  },
) => {
  const remoteEntry = joinRemoteEntry(target, entryId);
  const purge = await exec(['purge', remoteEntry]);
  if (purge.code !== 0 && !isRemoteNotFound(purge)) {
    throw new Error(`清理远端直通存档失败：${tailOutput(purge.stderr)}`);
  }
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'translime-pt-tomb-'));
  try {
    const metaFile = path.join(tempDir, 'meta.json');
    const meta = markMetaDeleted(
      createMeta({
        entryId, name, machineId, at: tombstoneAt,
      }),
      { machineId, at: tombstoneAt },
    );
    await writeJson(metaFile, meta);
    const result = await exec(['copyto', metaFile, joinRemoteMeta(target, entryId)]);
    if (result.code !== 0) {
      throw new Error(`写入远端删除标记失败：${tailOutput(result.stderr)}`);
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

/** 本地目录缺失时的整目录回补下载 */
export const restorePassthroughEntry = async (exec, target, { entryId, dir }) => {
  await ensureDir(dir);
  const result = await exec([
    'copy', joinRemoteEntry(target, entryId), dir, ...excludeMetaArgs,
  ]);
  if (result.code !== 0 && !isRemoteNotFound(result)) {
    throw new Error(`回补直通存档失败：${tailOutput(result.stderr)}`);
  }
};

/**
 * 直通删除墓碑冲突处置：
 * - keep-local：以本地为准撤销远端删除（全量上传 + 覆盖非删除 meta）
 * - confirm-deletion：确认远端删除，移除本地目录（远端墓碑保持）
 */
export const resolvePassthroughConflict = async (
  exec,
  target,
  {
    entryId, name, dir, mode, machineId,
  },
) => {
  if (mode === 'confirm-deletion') {
    await remove(dir);
    return { mode };
  }
  if (mode === 'keep-local') {
    const remoteEntry = joinRemoteEntry(target, entryId);
    const up = await exec(['copy', dir, remoteEntry, ...excludeMetaArgs]);
    if (up.code !== 0) {
      throw new Error(`上传直通存档失败：${tailOutput(up.stderr)}`);
    }
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'translime-pt-meta-'));
    try {
      await writeRemoteMeta(exec, target, { entryId, name, machineId }, tempDir);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    return { mode };
  }
  throw new Error(`未知的直通冲突处理方式：${mode}`);
};
