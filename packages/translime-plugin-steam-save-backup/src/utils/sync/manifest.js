import crypto from 'node:crypto';
import path from 'node:path';
import { readInfoFromArchive } from './archive';
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
 * 构建远端备份清单（暂存目录布局与远端一致）。
 * 远端自 v1.6 起以单个 zip 表示一份备份（`<gameId>/<时间戳>.zip`）；
 * v1.5 及之前的目录格式备份（`<gameId>/<时间戳>/info.json`）作为 legacy 返回，
 * 由对账流程自动迁移为 zip 并清理旧目录。
 *
 * @returns {Promise<{ zips: Object<string, Object<string, string>>, legacy: Array<{gameId: string, ts: string, digest: string}> }>}
 */
export const buildRemoteInventory = async (root) => {
  const zips = {};
  const legacy = [];
  const collectChild = (gameId, gameDir) => async (child) => {
    if (child.isFile() && child.name.endsWith('.zip')) {
      const ts = child.name.slice(0, -'.zip'.length);
      const info = await readInfoFromArchive(path.join(gameDir, child.name));
      if (!info) {
        return;
      }
      if (!zips[gameId]) {
        zips[gameId] = {};
      }
      zips[gameId][ts] = infoDigest(info);
      return;
    }
    if (child.isDirectory()) {
      const digest = await readInfoDigest(path.join(gameDir, child.name, 'info.json'));
      if (!digest) {
        return;
      }
      legacy.push({ gameId, ts: child.name, digest });
    }
  };
  const collectGame = async (gameId) => {
    const gameDir = path.join(root, gameId);
    const children = await readdir(gameDir, { withFileTypes: true });
    await Promise.all(children.map(collectChild(gameId, gameDir)));
  };
  const gameIds = await listChildDirs(root);
  await Promise.all(gameIds.map((gameId) => collectGame(gameId)));
  return { zips, legacy };
};

/**
 * 对账计划（docs/auto-sync-research.md §4.2）：
 * - 本地独有 → uploads；远端独有 → downloads（不同时间戳目录的并集即多设备收敛，保持自动）
 * - 同名目录摘要不一致（同一备份在两端内容分叉）→ conflicts：
 *   不自动合并，交由用户选择“覆盖本地 / 覆盖远程 / 保留两份”（Steam Cloud 式冲突确认）
 */

// 改名目标名冲突时追加 -2、-3… 序号，避免覆盖既有备份目录
export const uniqueDirName = (candidate, takenNames, attempt = 1) => {
  const name = attempt === 1 ? candidate : `${candidate}-${attempt}`;
  return takenNames.has(name) ? uniqueDirName(candidate, takenNames, attempt + 1) : name;
};

export const planSync = (localManifest, remoteManifest) => {
  const uploads = [];
  const downloads = [];
  const conflicts = [];

  const gameIds = new Set([
    ...Object.keys(localManifest || {}),
    ...Object.keys(remoteManifest || {}),
  ]);

  gameIds.forEach((gameId) => {
    const local = localManifest?.[gameId] || {};
    const remote = remoteManifest?.[gameId] || {};

    Object.keys(local).forEach((ts) => {
      if (!(ts in remote)) {
        uploads.push({ gameId, ts });
        return;
      }
      if (local[ts] !== remote[ts]) {
        conflicts.push({ gameId, ts });
      }
    });

    Object.keys(remote).forEach((ts) => {
      if (!(ts in local)) {
        downloads.push({ gameId, ts });
      }
    });
  });

  return { uploads, downloads, conflicts };
};
