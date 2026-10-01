import crypto from 'node:crypto';
import path from 'node:path';
import { pathExists, readdir, readJson } from '../fs-wrapper';

/**
 * 稳定序列化：对象键排序后输出，消除写入端键顺序差异对摘要的影响
 */
export const canonicalStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

/**
 * 计算备份目录的内容摘要。
 * note 是本地元数据，不参与同步比对（docs/auto-sync-research.md §4.5），
 * 修改备注不得把同名备份误判为冲突。
 */
export const infoDigest = (info) => {
  const rest = { ...(info || {}) };
  delete rest.note;
  return crypto.createHash('sha1').update(canonicalStringify(rest)).digest('hex');
};

const listChildDirs = async (dir) => {
  if (!(await pathExists(dir))) {
    return [];
  }
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
};

const readInfoDigest = async (infoPath) => {
  try {
    return infoDigest(await readJson(infoPath));
  } catch {
    return null;
  }
};

const buildGameEntry = async (root, gameId) => {
  const timestamps = await listChildDirs(path.join(root, gameId));
  const pairs = await Promise.all(timestamps.map(async (timestamp) => {
    const digest = await readInfoDigest(path.join(root, gameId, timestamp, 'info.json'));
    return digest ? [timestamp, digest] : null;
  }));
  const game = Object.fromEntries(pairs.filter(Boolean));
  return Object.keys(game).length > 0 ? [gameId, game] : null;
};

/**
 * 从目录树构建清单：{ [gameId]: { [timestamp]: digest } }
 * 只有包含可解析 info.json 的目录视为有效备份（缺 info.json 视为传输中断残留）。
 * 本地备份根目录与远端 info.json 暂存目录的布局一致，同一函数可构建两端清单。
 */
export const buildManifest = async (root) => {
  const gameIds = await listChildDirs(root);
  const entries = await Promise.all(gameIds.map((gameId) => buildGameEntry(root, gameId)));
  return Object.fromEntries(entries.filter(Boolean));
};

/**
 * 对账计划（docs/auto-sync-research.md §4.2）：
 * - 本地独有 → uploads；远端独有 → downloads
 * - 同名目录摘要不一致（两机同秒各建备份等）→ 本地改名为 `<timestamp>-<machineId>`
 *   保留两份：改名后的本地目录作为新目录上传，远端原件回补下载
 * 调用方需先应用 renames（物理改名）再执行 uploads，此时本地目录名与 uploads.ts 一致。
 */

// 改名目标名冲突时追加 -2、-3… 序号，避免覆盖既有备份目录
const uniqueDirName = (candidate, takenNames, attempt = 1) => {
  const name = attempt === 1 ? candidate : `${candidate}-${attempt}`;
  return takenNames.has(name) ? uniqueDirName(candidate, takenNames, attempt + 1) : name;
};

export const planSync = (localManifest, remoteManifest, machineId) => {
  const uploads = [];
  const downloads = [];
  const renames = [];
  const suffix = String(machineId || '').slice(0, 8) || 'local';

  const gameIds = new Set([
    ...Object.keys(localManifest || {}),
    ...Object.keys(remoteManifest || {}),
  ]);

  gameIds.forEach((gameId) => {
    const local = localManifest?.[gameId] || {};
    const remote = remoteManifest?.[gameId] || {};
    const taken = new Set([...Object.keys(local), ...Object.keys(remote)]);
    const renamedFrom = new Set();

    Object.keys(local).forEach((ts) => {
      if (!(ts in remote)) {
        uploads.push({ gameId, ts });
        return;
      }
      if (local[ts] === remote[ts]) {
        return;
      }
      const to = uniqueDirName(`${ts}-${suffix}`, taken);
      taken.add(to);
      renamedFrom.add(ts);
      renames.push({ gameId, from: ts, to });
      uploads.push({ gameId, ts: to });
    });

    Object.keys(remote).forEach((ts) => {
      if (!(ts in local) || renamedFrom.has(ts)) {
        downloads.push({ gameId, ts });
      }
    });
  });

  return { uploads, downloads, renames };
};
