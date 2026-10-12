import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathExists, readdir, readJson } from '../fs-wrapper';
import { isRemoteNotFound, tailOutput } from '../sync/rclone';
import {
  joinRemotePassthroughRoot,
  META_NAME,
  parseMeta,
} from './meta';

const listChildDirs = async (dir) => {
  if (!(await pathExists(dir))) {
    return [];
  }
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
};

const timeValue = (isoString) => {
  if (typeof isoString !== 'string') {
    return 0;
  }
  const parsed = Date.parse(isoString);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * 发现远端直通条目并返回概览。
 * 忽略已删除墓碑与无效元数据，按更新时间降序排列。
 *
 * @param {object} options
 * @param {(args: string[], options?: {timeoutMs?: number}) => Promise<{code: number, stdout: string, stderr: string}>} options.exec rclone 执行器
 * @param {string} options.target 远程目标（rclone remote 或本地/UNC 路径）
 * @param {string} [options.stageDir] 远端 meta 暂存目录（测试注入用，默认使用临时目录）
 * @param {() => boolean} [options.isCancelled] 取消检查
 * @returns {Promise<Array<{entryId: string, name: string, updatedAt: string|null, updatedBy: string|null}>>}
 */
export default async function discoverRemoteEntries({
  exec,
  target,
  stageDir,
  isCancelled = () => false,
}) {
  const ownsStage = !stageDir;
  const stage = stageDir || await fs.mkdtemp(path.join(os.tmpdir(), 'translime-pt-discover-'));
  try {
    const result = await exec([
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
    if (result.code !== 0 && !isRemoteNotFound(result)) {
      throw new Error(`读取直通远端元数据失败：${tailOutput(result.stderr)}`);
    }
    if (isCancelled()) {
      return [];
    }

    const entryIds = await listChildDirs(stage);
    const entries = (await Promise.all(entryIds.map(async (entryId) => {
      try {
        const meta = parseMeta(await readJson(path.join(stage, entryId, META_NAME)));
        if (!meta || meta.deleted) {
          return null;
        }
        return {
          entryId: meta.entryId,
          name: meta.name || meta.entryId,
          updatedAt: meta.updatedAt,
          updatedBy: meta.updatedBy,
        };
      } catch {
        return null;
      }
    }))).filter(Boolean);
    return entries.sort((a, b) => timeValue(b.updatedAt) - timeValue(a.updatedAt));
  } finally {
    if (ownsStage) {
      await fs.rm(stage, { recursive: true, force: true });
    }
  }
}
