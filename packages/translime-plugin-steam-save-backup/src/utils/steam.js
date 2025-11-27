import fs from 'fs-extra';
import path from 'path';
import vdf from 'vdf';
import { execSync } from 'child_process';

/**
 * 获取 Steam 安装路径
 * 尝试通过注册表或默认路径查找
 */
export async function getSteamPath() {
  // 1. 尝试常见默认路径
  const defaultPaths = [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
  ];

  for (const p of defaultPaths) {
    if (await fs.pathExists(p)) {
      return p;
    }
  }

  // 2. 尝试查询注册表 (Windows)
  try {
    const stdout = execSync('reg query HKEY_CURRENT_USER\\Software\\Valve\\Steam /v SteamPath', { encoding: 'utf8' });
    const match = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/);
    if (match && match[1]) {
      // 注册表中的路径可能使用 / 分隔，转换为系统分隔符
      return path.normalize(match[1]);
    }
  } catch (e) {
    console.warn('查询 Steam 路径注册表失败：', e);
  }

  return null;
}

/**
 * 获取所有 Steam 库文件夹路径
 * @param {string} steamPath 
 */
export async function getLibraryFolders(steamPath) {
  const libraryFoldersPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
  const libraries = [steamPath]; // 默认包含主目录

  if (await fs.pathExists(libraryFoldersPath)) {
    try {
      const content = await fs.readFile(libraryFoldersPath, 'utf8');
      const data = vdf.parse(content);

      if (data && data.libraryfolders) {
        for (const key in data.libraryfolders) {
          const lib = data.libraryfolders[key];
          if (lib && lib.path) {
            libraries.push(lib.path);
          } else if (typeof lib === 'string') {
            // 旧版格式可能直接是路径，或者是数字键对应路径
            libraries.push(lib);
          }
        }
      }
    } catch (e) {
      console.error('解析 libraryfolders.vdf 失败：', e);
    }
  }

  // 去重并规范化
  return [...new Set(libraries.map(p => path.normalize(p)))];
}

/**
 * 扫描已安装的游戏
 * @param {string} steamPath 
 */
export async function scanInstalledGames(steamPath) {
  const libraries = await getLibraryFolders(steamPath);
  const games = [];

  for (const lib of libraries) {
    const steamappsPath = path.join(lib, 'steamapps');
    if (!(await fs.pathExists(steamappsPath))) continue;

    const files = await fs.readdir(steamappsPath);
    const acfFiles = files.filter(f => f.endsWith('.acf'));

    for (const file of acfFiles) {
      try {
        const content = await fs.readFile(path.join(steamappsPath, file), 'utf8');
        const data = vdf.parse(content);
        const appState = data.AppState;

        if (appState) {
          games.push({
            appid: appState.appid,
            name: appState.name,
            installDir: path.join(steamappsPath, 'common', appState.installDir),
            libraryPath: lib,
          });
        }
      } catch (e) {
        console.warn(`解析 ${file} 失败：`, e);
      }
    }
  }

  return games;
}

/**
 * 获取 userdata 目录下的所有用户 ID
 * @param {string} steamPath 
 */
export async function getSteamUserIds(steamPath) {
  const userdataDir = path.join(steamPath, 'userdata');
  if (!(await fs.pathExists(userdataDir))) return [];

  const files = await fs.readdir(userdataDir);
  const userIds = [];

  for (const file of files) {
    const stats = await fs.stat(path.join(userdataDir, file));
    if (stats.isDirectory() && /^\d+$/.test(file)) {
      userIds.push(file);
    }
  }

  return userIds;
}

/**
 * 尝试查找游戏的存档路径
 * 目前主要查找 userdata 下的目录
 * @param {string} steamPath 
 * @param {string} appId 
 * @returns {Promise<string[]>} 可能的存档路径列表
 */
export async function findSavePaths(steamPath, appId) {
  const userIds = await getSteamUserIds(steamPath);
  const paths = [];

  for (const userId of userIds) {
    const savePath = path.join(steamPath, 'userdata', userId, appId);
    if (await fs.pathExists(savePath)) {
      paths.push(savePath);
    }
  }

  return paths;
}
