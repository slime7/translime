import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeGameNameKey } from '../custom-dirs';
import { pathExists, readdir, readJson } from '../fs-wrapper';
import { isRemoteNotFound, tailOutput } from './rclone';

const listChildDirs = async (dir) => {
  if (!(await pathExists(dir))) {
    return [];
  }
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
};

// 过滤墓碑标记与无效数据
const readRemoteInfo = async (infoPath) => {
  try {
    const info = await readJson(infoPath);
    if (!info || typeof info !== 'object' || info.deleted) {
      return null;
    }
    return info;
  } catch {
    return null;
  }
};

const timeValue = (isoString) => {
  if (typeof isoString !== 'string') {
    return 0;
  }
  const parsed = Date.parse(isoString);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const buildRemoteGame = async (stage, gameId) => {
  const timestamps = await listChildDirs(path.join(stage, gameId));
  const infos = await Promise.all(timestamps.map(async (timestamp) => {
    const info = await readRemoteInfo(path.join(stage, gameId, timestamp, 'info.json'));
    return info ? { timestamp, info } : null;
  }));

  const backups = infos
    .filter(Boolean)
    .map(({ timestamp, info }) => ({
      dir: timestamp,
      backupTime: typeof info.backupTime === 'string' ? info.backupTime : null,
      createdBy: typeof info.createdBy === 'string' ? info.createdBy : null,
      note: typeof info.note === 'string' ? info.note : '',
    }))
    .sort((a, b) => timeValue(b.backupTime) - timeValue(a.backupTime));
  if (backups.length === 0) {
    return null;
  }

  const namedInfo = infos.filter(Boolean).find(({ info }) => typeof info.gameName === 'string' && info.gameName.trim());
  return {
    gameId: String(gameId),
    gameName: namedInfo ? namedInfo.info.gameName.trim() : String(gameId),
    backups,
    backupCount: backups.length,
    latestBackupTime: backups[0].backupTime,
  };
};

/**
 * 发现远端备份并按游戏分组返回概览。
 * 忽略已删除墓碑与无效条目，按最新备份时间降序排列。
 *
 * @param {object} options
 * @param {(args: string[], options?: {timeoutMs?: number}) => Promise<{code: number, stdout: string, stderr: string}>} options.exec rclone 执行器
 * @param {string} options.target 远程目标（rclone remote 或本地/UNC 路径）
 * @param {string} [options.stageDir] 远端元数据暂存目录
 * @param {() => boolean} [options.isCancelled] 取消检查
 * @returns {Promise<Array<{gameId: string, gameName: string, backups: Array<{dir: string, backupTime: string|null, createdBy: string|null, note: string}>, backupCount: number, latestBackupTime: string|null}>>}
 */
export const discoverRemoteGames = async ({
  exec,
  target,
  stageDir,
  isCancelled = () => false,
}) => {
  const ownsStage = !stageDir;
  const stage = stageDir || await fs.mkdtemp(path.join(os.tmpdir(), 'translime-discover-'));
  try {
    const result = await exec([
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
    if (result.code !== 0 && !isRemoteNotFound(result)) {
      throw new Error(`读取远端清单失败：${tailOutput(result.stderr)}`);
    }
    if (isCancelled()) {
      return [];
    }

    const gameIds = await listChildDirs(stage);
    const games = (await Promise.all(gameIds.map((gameId) => buildRemoteGame(stage, gameId))))
      .filter(Boolean)
      .sort((a, b) => timeValue(b.latestBackupTime) - timeValue(a.latestBackupTime));
    return games;
  } finally {
    if (ownsStage) {
      await fs.rm(stage, { recursive: true, force: true });
    }
  }
};

/**
 * 判断远端游戏是否已在本地登记管理（按 gameId 或游戏名匹配）。
 *
 * @param {{gameId: string, gameName: string}} remoteGame 远端游戏概览
 * @param {{knownGames: Object<string, {appid: string, name: string}>, customSaveDirs: Array<{gameName: string, dir: string}>}} localState 本地游戏登记状态
 * @returns {boolean}
 */
export const isRemoteGameAddedLocally = ({ gameId, gameName }, { knownGames, customSaveDirs }) => {
  if (knownGames && knownGames[String(gameId)]) {
    return true;
  }
  const nameKey = normalizeGameNameKey(gameName);
  if (!nameKey) {
    return false;
  }
  return (customSaveDirs || [])
    .some((entry) => normalizeGameNameKey(entry && entry.gameName) === nameKey);
};
