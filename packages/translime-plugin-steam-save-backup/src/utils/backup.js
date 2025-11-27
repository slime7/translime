import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// 默认备份根目录
export const DEFAULT_BACKUP_ROOT = path.join(os.homedir(), 'Documents', 'TranslimeSteamBackups');

/**
 * 备份存档
 * @param {string} gameId 游戏 AppID
 * @param {string} gameName 游戏名称
 * @param {string} sourcePath 存档源路径
 * @param {string} [backupRoot] 备份根目录
 */
export async function backupSave(gameId, gameName, sourcePath, backupRoot = DEFAULT_BACKUP_ROOT) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(backupRoot, gameId.toString(), timestamp);

  // 1. 创建备份目录
  await fs.ensureDir(backupDir);

  // 2. 复制文件
  // 使用 copy 复制整个目录
  await fs.copy(sourcePath, path.join(backupDir, 'data'));

  // 3. 生成 info.json
  const info = {
    gameId,
    gameName,
    originalPath: sourcePath,
    backupTime: new Date().toISOString(),
    timestamp,
    note: '', // 预留备注字段
  };

  await fs.writeJson(path.join(backupDir, 'info.json'), info, { spaces: 2 });

  return { success: true, path: backupDir, info };
}

/**
 * 获取指定游戏的备份列表
 * @param {string} gameId 
 * @param {string} [backupRoot] 
 */
export async function getBackups(gameId, backupRoot = DEFAULT_BACKUP_ROOT) {
  const gameBackupDir = path.join(backupRoot, gameId.toString());
  if (!(await fs.pathExists(gameBackupDir))) return [];

  const dirs = await fs.readdir(gameBackupDir);
  const backups = [];

  for (const dir of dirs) {
    const infoPath = path.join(gameBackupDir, dir, 'info.json');
    if (await fs.pathExists(infoPath)) {
      try {
        const info = await fs.readJson(infoPath);
        backups.push({
          ...info,
          path: path.join(gameBackupDir, dir),
          id: dir, // 使用目录名作为 ID
        });
      } catch (e) {
        console.warn(`Failed to read info.json in ${dir}:`, e);
      }
    }
  }

  // 按时间倒序排列
  return backups.sort((a, b) => new Date(b.backupTime) - new Date(a.backupTime));
}

/**
 * 还原存档
 * @param {string} backupPath 备份目录路径 (包含 info.json 的那一层)
 */
export async function restoreSave(backupPath) {
  const infoPath = path.join(backupPath, 'info.json');
  if (!(await fs.pathExists(infoPath))) {
    throw new Error('无效备份：未找到 info.json');
  }

  const info = await fs.readJson(infoPath);
  const targetPath = info.originalPath;
  const sourceDataPath = path.join(backupPath, 'data');

  if (!(await fs.pathExists(sourceDataPath))) {
    throw new Error('无效备份：未找到 data 目录');
  }

  // 确保目标父目录存在
  await fs.ensureDir(path.dirname(targetPath));

  // 还原：清空目标目录并复制
  // 注意：这是一种破坏性操作，最好先做个临时备份，或者让用户确认
  // 这里直接覆盖
  await fs.emptyDir(targetPath);
  await fs.copy(sourceDataPath, targetPath);

  return { success: true, targetPath };
}
