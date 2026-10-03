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
 * note 为本地元数据，不参与同步比对，修改备注不会引起冲突。
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

const readInfoRecord = async (infoPath) => {
  try {
    const info = await readJson(infoPath);
    if (!info || typeof info !== 'object') {
      return null;
    }
    return {
      digest: infoDigest(info),
      deleted: Boolean(info.deleted),
      deletedAt: typeof info.deletedAt === 'string' ? info.deletedAt : null,
      deletedBy: typeof info.deletedBy === 'string' ? info.deletedBy : null,
    };
  } catch {
    return null;
  }
};

const buildGameEntry = async (root, gameId) => {
  const timestamps = await listChildDirs(path.join(root, gameId));
  const pairs = await Promise.all(timestamps.map(async (timestamp) => {
    const record = await readInfoRecord(path.join(root, gameId, timestamp, 'info.json'));
    return record ? [timestamp, record] : null;
  }));
  const game = Object.fromEntries(pairs.filter(Boolean));
  return Object.keys(game).length > 0 ? [gameId, game] : null;
};

/**
 * 从目录树构建详细清单：
 * - manifest：{ [gameId]: { [timestamp]: digest } }
 * - tombstones：{ [gameId]: { [timestamp]: { deletedAt, deletedBy } } }（远端删除墓碑）
 * 只有包含可解析 info.json 的目录视为有效备份（缺 info.json 视为传输中断残留）。
 * 本地备份根目录与远端 info.json 暂存目录的布局一致（远端每份备份即
 * `<gameId>/<时间戳>/info.json` + 数据包），同一函数可构建两端清单。
 */
export const collectManifestDetails = async (root) => {
  const gameIds = await listChildDirs(root);
  const entries = await Promise.all(gameIds.map((gameId) => buildGameEntry(root, gameId)));
  const details = Object.fromEntries(entries.filter(Boolean));

  const manifest = {};
  const tombstones = {};
  Object.entries(details).forEach(([gameId, timestamps]) => {
    const digests = {};
    const gameTombs = {};
    Object.entries(timestamps).forEach(([timestamp, record]) => {
      digests[timestamp] = record.digest;
      if (record.deleted) {
        gameTombs[timestamp] = { deletedAt: record.deletedAt, deletedBy: record.deletedBy };
      }
    });
    manifest[gameId] = digests;
    if (Object.keys(gameTombs).length > 0) {
      tombstones[gameId] = gameTombs;
    }
  });
  return { manifest, tombstones };
};

export const buildManifest = async (root) => (await collectManifestDetails(root)).manifest;

/**
 * 由原备份元数据构造远端墓碑：保留原信息并追加删除标记。
 * 删除字段参与摘要比对：同一版本插件端之间视图一致；
 * 旧版本插件端会把墓碑当普通备份（下载时缺 data.zip 报错），需各端同步升级。
 */
export const buildTombstoneInfo = (info, { machineId, at }) => ({
  ...(info && typeof info === 'object' && !Array.isArray(info) ? info : {}),
  deleted: true,
  deletedAt: at,
  deletedBy: machineId || null,
});

/**
 * 对账计划生成：
 * - 本地独有 → uploads；远端独有 → downloads
 * - 同名目录摘要不一致 → conflicts，由用户选择处理方式
 * - 远端墓碑（tombstones）→ deletions 候选，且该条目禁止上传与回补下载：
 *   由引擎结合本地 backupTime 与 deletedAt 判定「跟随删除」或「删除冲突」，
 *   防止仍持有该备份的其他端把已删备份重新推上远端（复活）
 */
export const planSync = (localManifest, remoteManifest, tombstones = {}) => {
  const uploads = [];
  const downloads = [];
  const conflicts = [];
  const deletions = [];

  const gameIds = new Set([
    ...Object.keys(localManifest || {}),
    ...Object.keys(remoteManifest || {}),
  ]);

  gameIds.forEach((gameId) => {
    const local = localManifest?.[gameId] || {};
    const remote = remoteManifest?.[gameId] || {};
    const tomb = tombstones?.[gameId] || {};

    Object.keys(local).forEach((ts) => {
      if (ts in tomb) {
        deletions.push({ gameId, ts });
        return;
      }
      if (!(ts in remote)) {
        uploads.push({ gameId, ts });
        return;
      }
      if (local[ts] !== remote[ts]) {
        conflicts.push({ gameId, ts });
      }
    });

    Object.keys(remote).forEach((ts) => {
      if (ts in tomb) {
        return;
      }
      if (!(ts in local)) {
        downloads.push({ gameId, ts });
      }
    });
  });

  return {
    uploads, downloads, conflicts, deletions,
  };
};

// 改名目标名冲突时追加 -2、-3… 序号，避免覆盖既有备份目录
export const uniqueDirName = (candidate, takenNames, attempt = 1) => {
  const name = attempt === 1 ? candidate : `${candidate}-${attempt}`;
  return takenNames.has(name) ? uniqueDirName(candidate, takenNames, attempt + 1) : name;
};
