import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import vdf from './vdf-parser.js';

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
  return [...new Set(libraries.map((p) => path.normalize(p)))];
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
    const acfFiles = files.filter((f) => f.endsWith('.acf'));

    for (const file of acfFiles) {
      try {
        const content = await fs.readFile(path.join(steamappsPath, file), 'utf8');
        const data = vdf.parse(content);
        const appState = data.AppState;

        if (appState) {
          games.push({
            appid: appState.appid,
            name: appState.name,
            installDir: path.join(steamappsPath, 'common', appState.installdir),
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
 * Steam remotecache.vdf 中 root 值的含义（基于实际测试）：
 * 0 = <userdata>/<userId>/<appId>/remote/ (Steam Cloud 同步目录)
 * 1 = 游戏安装目录
 * 2 = %USERPROFILE%\Documents\ (我的文档) 或 Saved Games
 * 3 = %LOCALAPPDATA% (AppData\Local) - 例如 EarthDefenceForce6
 * 4 = %APPDATA% (AppData\Roaming) - 例如 Factorio saves
 * 12 = %LOCALAPPDATA%Low (AppData\LocalLow)
 *
 * 注：同一游戏可能使用多个 root 类型，备份时需要记录所有来源
 */

/**
 * 存档路径信息
 * @typedef {Object} SavePathInfo
 * @property {number} root - root 类型
 * @property {string} relativePath - 相对路径（从文件路径中提取的目录部分）
 * @property {string|null} absolutePath - 解析后的绝对路径（如果可以确定）
 * @property {string[]} files - 该目录下的文件列表
 */

/**
 * 尝试查找游戏的存档路径
 * 通过解析 userdata 下的 remotecache.vdf 获取
 * @param {string} steamPath
 * @param {string} appId
 * @param {string} [gameInstallDir] - 游戏安装目录（用于解析 root=1 的路径）
 * @returns {Promise<SavePathInfo[]>} 存档路径信息列表
 */
export async function findSavePaths(steamPath, appId, gameInstallDir = null) {
  const userIds = await getSteamUserIds(steamPath);
  /** @type {Map<string, SavePathInfo>} */
  const pathsMap = new Map();

  // 获取系统目录
  const userProfile = process.env.USERPROFILE || process.env.HOME || '';
  const appData = process.env.APPDATA || path.join(userProfile, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || path.join(userProfile, 'AppData', 'Local');
  const documentsPath = path.join(userProfile, 'Documents');
  const savedGamesPath = path.join(userProfile, 'Saved Games');
  const localAppDataLow = path.join(userProfile, 'AppData', 'LocalLow');

  for (const userId of userIds) {
    const appDir = path.join(steamPath, 'userdata', userId, appId);
    const remoteCachePath = path.join(appDir, 'remotecache.vdf');

    if (await fs.pathExists(remoteCachePath)) {
      try {
        const content = await fs.readFile(remoteCachePath, 'utf8');
        const data = vdf.parse(content);

        // remotecache.vdf 结构为 { "AppID": { "ChangeNumber": "x", "filename": { "root": "x", ... } } }
        const appData2 = data[appId];
        if (appData2) {
          // 遍历所有文件条目
          for (const fileKey in appData2) {
            const fileInfo = appData2[fileKey];
            // 跳过非文件条目（如 ChangeNumber, ostype）
            if (!fileInfo || typeof fileInfo !== 'object' || !('root' in fileInfo)) {
              continue;
            }

            const rootType = parseInt(String(fileInfo.root), 10);
            // 从文件路径中提取目录部分
            const filePath = fileKey.replace(/\\/g, '/');
            const dirPath = path.dirname(filePath);

            // 创建唯一键（root + 目录路径）
            const key = `${rootType}:${dirPath}`;

            if (!pathsMap.has(key)) {
              let absolutePath = null;

              // 根据 root 类型解析绝对路径
              switch (rootType) {
                case 0: // Steam Cloud remote 目录
                  absolutePath = path.join(appDir, 'remote', dirPath);
                  break;
                case 1: // 游戏安装目录
                  if (gameInstallDir) {
                    absolutePath = path.join(gameInstallDir, dirPath);
                  }
                  break;
                case 2: // Documents (我的文档) 或 Saved Games
                  absolutePath = path.join(documentsPath, dirPath);
                  // 如果不存在，尝试 Saved Games
                  if (!(await fs.pathExists(absolutePath))) {
                    const altPath = path.join(savedGamesPath, dirPath);
                    if (await fs.pathExists(altPath)) {
                      absolutePath = altPath;
                    }
                  }
                  break;
                case 3: // AppData\Local
                  absolutePath = path.join(localAppData, dirPath);
                  break;
                case 4: // AppData\Roaming
                  absolutePath = path.join(appData, dirPath);
                  break;
                case 12: // AppData\LocalLow
                  absolutePath = path.join(localAppDataLow, dirPath);
                  break;
              }

              pathsMap.set(key, {
                root: rootType,
                relativePath: dirPath,
                absolutePath,
                files: [path.basename(filePath)],
              });
            } else {
              // 添加文件到现有条目
              pathsMap.get(key).files.push(path.basename(filePath));
            }
          }
        }
      } catch (e) {
        console.warn(`解析 remotecache.vdf 失败 (${appId}):`, e);
      }
    }
  }

  return Array.from(pathsMap.values());
}
