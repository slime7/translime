import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// 默认备份根目录
export const DEFAULT_BACKUP_ROOT = path.join(os.homedir(), 'Documents', 'TranslimeSteamBackups');

/**
 * 备份存档
 * @param {string} gameId 游戏 AppID
 * @param {string} gameName 游戏名称
 * @param {Array<{root: number, relativePath: string, absolutePath: string, files: string[]}>} savePaths 存档路径信息数组
 * @param {string} [backupRoot] 备份根目录
 */
export async function backupSave(gameId, gameName, savePaths, backupRoot = DEFAULT_BACKUP_ROOT) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(backupRoot, gameId.toString(), timestamp);

  // 1. 创建备份目录
  await fs.ensureDir(backupDir);

  // 2. 备份所有存档路径
  const results = await Promise.all(savePaths.map(async (saveInfo, i) => {
    if (!saveInfo.absolutePath) return null;

    // 检查路径是否存在
    if (!(await fs.pathExists(saveInfo.absolutePath))) {
      console.warn(`存档路径不存在，跳过: ${saveInfo.absolutePath}`);
      return null;
    }

    // 为每个路径创建子目录，使用索引区分
    const dataDir = path.join(backupDir, `data_${i}`);
    await fs.copy(saveInfo.absolutePath, dataDir);

    return {
      index: i,
      root: saveInfo.root,
      relativePath: saveInfo.relativePath,
      absolutePath: saveInfo.absolutePath,
      files: saveInfo.files,
    };
  }));

  const backedUpPaths = results.filter((p) => p !== null);

  if (backedUpPaths.length === 0) {
    throw new Error('没有找到可备份的存档文件');
  }

  // 3. 生成 info.json，包含完整的路径信息以便还原
  const info = {
    gameId,
    gameName,
    savePaths: backedUpPaths, // 保存所有路径信息
    backupTime: new Date().toISOString(),
    timestamp,
    note: '',
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

  const results = await Promise.all(dirs.map(async (dir) => {
    const infoPath = path.join(gameBackupDir, dir, 'info.json');
    if (await fs.pathExists(infoPath)) {
      try {
        const info = await fs.readJson(infoPath);
        return {
          ...info,
          path: path.join(gameBackupDir, dir),
          id: dir, // 使用目录名作为 ID
        };
      } catch (e) {
        console.warn(`Failed to read info.json in ${dir}:`, e);
      }
    }
    return null;
  }));

  const backups = results.filter((b) => b !== null);

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

  // 支持新格式（多路径）和旧格式（单路径）
  if (info.savePaths && Array.isArray(info.savePaths)) {
    // 新格式：多路径备份
    const results = await Promise.all(info.savePaths.map(async (saveInfo) => {
      const sourceDataPath = path.join(backupPath, `data_${saveInfo.index}`);
      const targetPath = saveInfo.absolutePath;

      if (!(await fs.pathExists(sourceDataPath))) {
        console.warn(`备份数据不存在，跳过: ${sourceDataPath}`);
        return null;
      }

      // 确保目标父目录存在
      await fs.ensureDir(path.dirname(targetPath));

      // 还原：清空目标目录并复制
      await fs.emptyDir(targetPath);
      await fs.copy(sourceDataPath, targetPath);

      return targetPath;
    }));

    const restoredPaths = results.filter((p) => p !== null);

    if (restoredPaths.length === 0) {
      throw new Error('没有成功还原任何存档');
    }

    return { success: true, restoredPaths };
  }
  // 旧格式：单路径备份（兼容）
  const targetPath = info.originalPath;
  const sourceDataPath = path.join(backupPath, 'data');

  if (!(await fs.pathExists(sourceDataPath))) {
    throw new Error('无效备份：未找到 data 目录');
  }

  await fs.ensureDir(path.dirname(targetPath));
  await fs.emptyDir(targetPath);
  await fs.copy(sourceDataPath, targetPath);

  return { success: true, targetPath };
}
