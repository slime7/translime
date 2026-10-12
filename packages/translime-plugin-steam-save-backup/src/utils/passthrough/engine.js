import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createArchive, extractArchive } from '../sync/archive';
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
  META_NAME,
  parseMeta,
} from './meta';
import planPassthroughEntry from './plan';

// 远端条目由 data.zip 数据包与独立的 meta.json 组成
const DATA_NAME = 'data.zip';
const DATA_PART = `${DATA_NAME}.part`;

/**
 * 采集本地目录状态：存在性、最新修改时间与文件清单（相对路径 → mtimeMs:size）。
 */
export const collectLocalState = async (dir) => {
  if (!(await pathExists(dir))) {
    return { exists: false, newestMtime: null, manifest: null };
  }
  let newestMtime = null;
  const manifest = {};
  const walk = async (current, rel) => {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(entries.map(async (entry) => {
      const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath, entryRel);
        return;
      }
      try {
        const stats = await fs.stat(entryPath);
        manifest[entryRel] = `${Math.round(stats.mtimeMs)}:${stats.size}`;
        if (newestMtime == null || stats.mtimeMs > newestMtime) {
          newestMtime = stats.mtimeMs;
        }
      } catch {
        // 文件恰好被删除：跳过
      }
    }));
  };
  await walk(dir, '');
  return { exists: true, newestMtime, manifest };
};

/**
 * 比对本地当前清单与上次记录，判定是否存在变更。
 */
const manifestDiffers = (current, stored) => {
  if (!stored) {
    return true;
  }
  const currentKeys = Object.keys(current);
  const storedKeys = Object.keys(stored);
  if (currentKeys.length !== storedKeys.length) {
    return true;
  }
  return currentKeys.some((key) => current[key] !== stored[key]);
};

/** 将条目元数据写入远端 */
const writeRemoteMeta = async (exec, target, {
  entryId, name, machineId, at,
}, tempDir) => {
  const metaFile = path.join(tempDir, `${entryId}.meta.json`);
  await writeJson(metaFile, createMeta({
    entryId, name, machineId, at,
  }));
  const result = await exec(['copyto', metaFile, joinRemoteMeta(target, entryId)]);
  if (result.code !== 0) {
    throw new Error(`写入直通远端元数据失败：${tailOutput(result.stderr)}`);
  }
};

/**
 * 打包上传本地目录并更新远端元数据，返回写入的 updatedAt。
 */
const uploadEntryArchive = async (exec, target, {
  entryId, name, dir, machineId,
}, tempDir) => {
  const tempZip = path.join(tempDir, `${entryId}.uploading.zip`);
  await createArchive(dir, tempZip);
  const entryRemote = joinRemoteEntry(target, entryId);
  const partResult = await exec(['copyto', tempZip, `${entryRemote}/${DATA_PART}`]);
  if (partResult.code !== 0) {
    throw new Error(`上传直通存档失败：${tailOutput(partResult.stderr)}`);
  }
  const moveResult = await exec(['moveto', `${entryRemote}/${DATA_PART}`, `${entryRemote}/${DATA_NAME}`]);
  if (moveResult.code !== 0) {
    throw new Error(`完成直通存档上传失败：${tailOutput(moveResult.stderr)}`);
  }
  await fs.rm(tempZip, { force: true });
  const at = new Date().toISOString();
  await writeRemoteMeta(exec, target, {
    entryId, name, machineId, at,
  }, tempDir);
  return at;
};

// 递归统计目录内文件数
const countLocalFiles = async (root) => {
  let count = 0;
  const walk = async (current) => {
    const items = await fs.readdir(current, { withFileTypes: true });
    await Promise.all(items.map(async (item) => {
      if (!item.isDirectory()) {
        count += 1;
        return;
      }
      await walk(path.join(current, item.name));
    }));
  };
  await walk(root);
  return count;
};

/**
 * 快照替换：先备份旧目录，解压并核对文件数无误后移除备份，失败时回滚。
 */
const replaceDirWithArchive = async (zipPath, dir, { stampMtime }) => {
  const backupDir = path.join(path.dirname(dir), `.${path.basename(dir)}.translime-bak`);
  await remove(backupDir);
  const existed = await pathExists(dir);
  let moved = false;
  try {
    if (existed) {
      await fs.rename(dir, backupDir);
      moved = true;
    }
    const expected = await extractArchive(zipPath, dir, { stampMtime });
    const actual = await countLocalFiles(dir);
    if (actual !== expected) {
      throw new Error(`解压不完整：预期 ${expected} 个文件，实际 ${actual} 个`);
    }
  } catch (e) {
    if (moved) {
      await remove(dir);
      try {
        await fs.rename(backupDir, dir);
      } catch (restoreError) {
        throw new Error(`${e.message}；回滚失败，旧存档备份保留在 ${backupDir}（${restoreError.message}）`);
      }
    } else {
      await remove(dir).catch(() => {});
    }
    throw e;
  }
  // 至此同步已成功；备份清理失败只留下可手动删除的孤儿目录，不推翻本次结果
  await remove(backupDir).catch(() => {});
};

/** 下载数据包并快照替换本地目录 */
const downloadEntryArchive = async (exec, target, { entryId, dir }, tempDir, { stampMtime = null } = {}) => {
  const tempZip = path.join(tempDir, `${entryId}.downloading.zip`);
  const result = await exec(['copyto', `${joinRemoteEntry(target, entryId)}/${DATA_NAME}`, tempZip]);
  if (result.code !== 0) {
    throw new Error(`下载直通存档失败：${tailOutput(result.stderr)}`);
  }
  try {
    await replaceDirWithArchive(tempZip, dir, { stampMtime });
  } finally {
    await fs.rm(tempZip, { force: true });
  }
};

// 递归列举远端目录下的文件列表
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

// 归纳远端条目形态：包含数据包及其他需清理的条目
const describeRemoteEntries = (files) => {
  const entries = {};
  files.forEach((rel) => {
    const slash = rel.indexOf('/');
    if (slash <= 0) {
      return;
    }
    const entryId = rel.slice(0, slash);
    const child = rel.slice(slash + 1);
    const entry = entries[entryId]
      || (entries[entryId] = { hasZip: false, children: new Map() });
    if (child === DATA_NAME) {
      entry.hasZip = true;
      return;
    }
    if (child !== META_NAME) {
      const name = child.split('/')[0];
      if (!entry.children.has(name)) {
        entry.children.set(name, child.includes('/') ? 'dir' : 'file');
      }
    }
  });
  return entries;
};

// 串行执行异步任务
const runSequential = (items, step) => items.reduce(
  (chain, item) => chain.then(() => step(item)),
  Promise.resolve(),
);

// 清理远端条目里数据包与 meta 以外的残留条目（旧版本散文件布局升级后的收尾）：
// 文件用 deletefile，目录用 purge
const purgeRemoteChildren = async (exec, target, entryId, children) => {
  const entryRemote = joinRemoteEntry(target, entryId);
  await runSequential(children.entries(), async ([child, kind]) => {
    const result = await exec([kind === 'dir' ? 'purge' : 'deletefile', `${entryRemote}/${child}`]);
    if (result.code !== 0 && !isRemoteNotFound(result)) {
      throw new Error(`清理远端旧形态存档失败：${tailOutput(result.stderr)}`);
    }
  });
};

// 执行单条目对账，返回需记录的新水位与清单
const processEntry = async ({
  exec, target, entry, stage, tempDir, machineId, report,
  remoteShape, watermark, storedManifest, onEntry, beforeWrite, afterWrite,
}) => {
  const { entryId, name, dir } = entry;
  let remoteMeta = null;
  try {
    remoteMeta = parseMeta(await readJson(path.join(stage, entryId, META_NAME)));
  } catch {
    remoteMeta = null;
  }
  const localState = await collectLocalState(dir);
  // 基线未知或清单有差异时视为本地有变更
  const baselineKnown = !Number.isNaN(Date.parse(watermark || ''));
  const localChanged = !baselineKnown || manifestDiffers(localState.manifest, storedManifest);
  const plan = planPassthroughEntry({
    remoteMeta,
    localExists: localState.exists,
    localChanged,
    localNewestMtime: localState.newestMtime,
    watermark,
    remoteHasData: remoteShape.hasZip,
  });

  if (plan.action === 'apply-deletion') {
    // 远端已删除且本地无新变更：跟随删除
    await remove(dir);
    report.appliedDeletions.push({ entryId, name });
    onEntry({ entry, action: 'apply-deletion' });
    return undefined;
  }
  if (plan.action === 'deletion-conflict') {
    report.conflicts.push({
      entryId,
      name,
      kind: 'deletion',
      detectedAt: new Date().toISOString(),
    });
    onEntry({ entry, action: 'deletion-conflict' });
    return undefined;
  }
  if (plan.action === 'content-conflict') {
    // 双端均有更新：登记为内容冲突
    report.conflicts.push({
      entryId,
      name,
      kind: 'content',
      localUpdatedAt: localState.newestMtime != null
        ? new Date(localState.newestMtime).toISOString()
        : null,
      remoteUpdatedAt: remoteMeta && typeof remoteMeta.updatedAt === 'string'
        ? remoteMeta.updatedAt
        : null,
      remoteUpdatedBy: remoteMeta && typeof remoteMeta.updatedBy === 'string'
        ? remoteMeta.updatedBy
        : null,
      detectedAt: new Date().toISOString(),
    });
    onEntry({ entry, action: 'content-conflict' });
    return undefined;
  }
  if (plan.action === 'local-missing' || plan.action === 'noop') {
    report.skipped.push({
      entryId, name, reason: plan.action,
    });
    onEntry({ entry, action: plan.action });
    return undefined;
  }

  // 执行上传或下载
  try {
    beforeWrite(dir);
    let nextWatermark = null;
    let nextManifest = null;
    if (plan.action === 'sync-upload') {
      // 打包上传本地目录
      nextWatermark = await uploadEntryArchive(exec, target, {
        entryId, name, dir, machineId,
      }, tempDir);
      nextManifest = localState.manifest;
    } else {
      const updatedAt = remoteMeta && !Number.isNaN(Date.parse(remoteMeta.updatedAt || ''))
        ? remoteMeta.updatedAt
        : null;
      await downloadEntryArchive(exec, target, { entryId, dir }, tempDir, {
        stampMtime: updatedAt ? new Date(updatedAt) : null,
      });
      nextWatermark = updatedAt;
      // 重新采集本地清单作为新基准
      nextManifest = (await collectLocalState(dir)).manifest;
    }
    // 清理远端冗余条目
    if (remoteShape.children.size > 0) {
      try {
        await purgeRemoteChildren(exec, target, entryId, remoteShape.children);
      } catch (cleanupError) {
        report.errors.push({
          entryId, name, message: cleanupError.message,
        });
      }
    }
    report.updated.push({ entryId, name });
    onEntry({ entry, action: 'synced' });
    return { watermark: nextWatermark, manifest: nextManifest };
  } catch (e) {
    report.errors.push({
      entryId, name, message: e.message,
    });
    onEntry({ entry, action: 'error', message: e.message });
    return undefined;
  } finally {
    afterWrite(dir);
  }
};

/**
 * 直通云存档对账：执行本地目录与远端数据包快照对账并处理删除墓碑。
 *
 * @param {object} options
 * @param {(args: string[], options?: object) => Promise<{code: number, stdout: string, stderr: string}>} options.exec rclone 执行器
 * @param {string} options.target 远程目标
 * @param {Array<{entryId: string, name: string, dir: string}>} options.entries 直通条目
 * @param {string} options.machineId 本机标识（写入 meta 的 updatedBy）
 * @param {Object<string, string>} [options.watermarks] 各条目本机上次完成同步的水位（entryId → ISO 时间）
 * @param {Object<string, Object<string, string>>} [options.manifests] 各条目上次同步的本地文件清单（entryId → relPath → `mtimeMs:size`）
 * @param {() => boolean} [options.isCancelled] 取消检查
 * @param {string} [options.stageDir] 远端 meta 暂存目录（测试注入用）
 * @param {(info: object) => void} [options.onEntry] 每条目动作回调（驱动通知与抑制窗口）
 * @param {(dir: string) => void} [options.beforeWrite] 条目开始回写本地前的钩子（监控抑制）
 * @param {(dir: string) => void} [options.afterWrite] 条目回写结束后的钩子（解除抑制）
 * @returns {Promise<object>} report，watermarks/manifests 为本轮各条目的新状态（由调用方并入持久状态）
 */
export const runPassthroughSync = async ({
  exec,
  target,
  entries,
  machineId,
  watermarks = {},
  manifests = {},
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
    watermarks: {},
    manifests: {},
  };
  try {
    assertAlive();
    // 批量拉取远端条目 meta
    const stageResult = await exec([
      'copy',
      joinRemotePassthroughRoot(target),
      stage,
      '--include',
      `*/${META_NAME}`,
      '--transfers',
      '8',
      '--contimeout',
      '20s',
    ]);
    if (stageResult.code !== 0 && !isRemoteNotFound(stageResult)) {
      throw new Error(`读取直通远端元数据失败：${tailOutput(stageResult.stderr)}`);
    }
    assertAlive();

    // 列举远端文件结构
    const remoteEntries = describeRemoteEntries(await listRemoteFiles(
      exec,
      joinRemotePassthroughRoot(target),
    ));

    const watermarkUpdates = report.watermarks;
    const manifestUpdates = report.manifests;
    await runSequential(entries, async (entry) => {
      assertAlive();
      const result = await processEntry({
        exec,
        target,
        entry,
        stage,
        tempDir,
        machineId,
        report,
        remoteShape: remoteEntries[entry.entryId] || { hasZip: false, children: new Map() },
        watermark: watermarks[entry.entryId] || null,
        storedManifest: manifests[entry.entryId] || null,
        onEntry,
        beforeWrite,
        afterWrite,
      });
      if (result) {
        watermarkUpdates[entry.entryId] = result.watermark;
        manifestUpdates[entry.entryId] = result.manifest;
      }
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
 * 清理远端条目数据并写入删除墓碑。
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

/**
 * 本地目录缺失时拉取远端数据包回补，返回水位与本地清单。
 */
export const restorePassthroughEntry = async (exec, target, { entryId, dir }) => {
  await ensureDir(dir);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'translime-pt-restore-'));
  try {
    let updatedAt = null;
    const metaFile = path.join(tempDir, 'meta.json');
    const metaResult = await exec(['copyto', joinRemoteMeta(target, entryId), metaFile]);
    if (metaResult.code === 0) {
      try {
        const meta = parseMeta(await readJson(metaFile));
        if (meta && !meta.deleted && meta.updatedAt && !Number.isNaN(Date.parse(meta.updatedAt))) {
          updatedAt = meta.updatedAt;
        }
      } catch {
        updatedAt = null;
      }
    }

    const remoteFiles = await listRemoteFiles(exec, joinRemoteEntry(target, entryId));
    if (!remoteFiles.includes(DATA_NAME)) {
      return { updatedAt: null, manifest: null };
    }
    await downloadEntryArchive(exec, target, { entryId, dir }, tempDir, {
      stampMtime: updatedAt ? new Date(updatedAt) : null,
    });
    return { updatedAt, manifest: (await collectLocalState(dir)).manifest };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

/**
 * 直通冲突处置：
 * - keep-local：以本地为准覆盖远端并返回新水位与清单
 * - use-remote：以远端为准快照替换本地并返回新水位与清单
 * - confirm-deletion：确认删除本地目录
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
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'translime-pt-meta-'));
    try {
      const updatedAt = await uploadEntryArchive(exec, target, {
        entryId, name, dir, machineId,
      }, tempDir);
      return { mode, updatedAt, manifest: (await collectLocalState(dir)).manifest };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
  if (mode === 'use-remote') {
    // 拉取远端数据包替换本地目录
    return { mode, ...(await restorePassthroughEntry(exec, target, { entryId, dir })) };
  }
  throw new Error(`未知的直通冲突处理方式：${mode}`);
};
