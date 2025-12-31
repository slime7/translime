import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { parse as vdfParse } from './vdf-parser';

/**
 * 获取 Steam 安装路径
 * 尝试通过注册表或默认路径查找
 */
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

  const pathChecks = await Promise.all(defaultPaths.map(async (p) => {
    if (await fs.pathExists(p)) return p;
    return null;
  }));

  const foundPath = pathChecks.find((p) => p !== null);
  if (foundPath) return foundPath;

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
      const data = vdfParse(content);

      if (data && data.libraryfolders) {
        Object.values(data.libraryfolders).forEach((lib) => {
          if (lib && lib.path) {
            libraries.push(lib.path);
          } else if (typeof lib === 'string') {
            // 旧版格式可能直接是路径，或者是数字键对应路径
            libraries.push(lib);
          }
        });
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

  const gamesAcrossLibraries = await Promise.all(libraries.map(async (lib) => {
    const steamappsPath = path.join(lib, 'steamapps');
    if (!(await fs.pathExists(steamappsPath))) return [];

    const files = await fs.readdir(steamappsPath);
    const acfFiles = files.filter((f) => f.endsWith('.acf'));

    const gamesInLib = await Promise.all(acfFiles.map(async (file) => {
      try {
        const content = await fs.readFile(path.join(steamappsPath, file), 'utf8');
        const data = vdfParse(content);
        const appState = data.AppState;

        if (appState) {
          return {
            appid: appState.appid,
            name: appState.name,
            installDir: path.join(steamappsPath, 'common', appState.installdir),
            libraryPath: lib,
          };
        }
      } catch (e) {
        console.warn(`解析 ${file} 失败：`, e);
      }
      return null;
    }));

    return gamesInLib.filter((g) => g !== null);
  }));

  return gamesAcrossLibraries.flat();
}

/**
 * 获取 userdata 目录下的所有用户 ID
 * @param {string} steamPath
 */
export async function getSteamUserIds(steamPath) {
  const userdataDir = path.join(steamPath, 'userdata');
  if (!(await fs.pathExists(userdataDir))) return [];

  const files = await fs.readdir(userdataDir);

  const results = await Promise.all(files.map(async (file) => {
    const stats = await fs.stat(path.join(userdataDir, file));
    if (stats.isDirectory() && /^\d+$/.test(file)) {
      return file;
    }
    return null;
  }));

  return results.filter((id) => id !== null);
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

  // 获取系统目录
  const userProfile = process.env.USERPROFILE || process.env.HOME || '';
  const appData = process.env.APPDATA || path.join(userProfile, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || path.join(userProfile, 'AppData', 'Local');
  const documentsPath = path.join(userProfile, 'Documents');
  const savedGamesPath = path.join(userProfile, 'Saved Games');
  const localAppDataLow = path.join(userProfile, 'AppData', 'LocalLow');

  // 由于上述逻辑在替换中比较复杂，我先用原有的逻辑调整为并行，并解决并发访问 Map 的问题。
  // 其实这里的 Map 访问逻辑：
  // 1. check map.has(key)
  // 2. if not, calculate absolutePath (ASYNC), then set map
  // 3. else, push to files (SYNC)
  // 问题在于 step 2 有 await，如果两个并发任务处理相同 key，第一个 await 时，第二个进来也会 check !has，于是计算两次并 set 两次。
  // 这会导致第二次覆盖第一次（无害？），但如果第二次 set 了一个新对象，第一次后续的 push 就可能丢了或者 push 到旧对象（如果引用没变）。
  // 为了安全，我们可以在 Map 里存 Promise？或者改回串行（在每个 user 内部串行，user 之间并行）。
  // 考虑到同一个游戏同一个用户的 remotecache 文件条目可能很多，但目录不会太多。
  // 让我们采用“先收集条目，再处理”的策略。

  // 收集所有需要处理的文件条目
  const entries = [];
  await Promise.all(userIds.map(async (userId) => {
    const appDir = path.join(steamPath, 'userdata', userId, appId);
    const remoteCachePath = path.join(appDir, 'remotecache.vdf');

    if (await fs.pathExists(remoteCachePath)) {
      try {
        const content = await fs.readFile(remoteCachePath, 'utf8');
        const data = vdfParse(content);
        const appData2 = data[appId];
        if (appData2) {
          Object.entries(appData2).forEach(([fileKey, fileInfo]) => {
            if (fileInfo && typeof fileInfo === 'object' && 'root' in fileInfo) {
              entries.push({ fileKey, fileInfo, appDir });
            }
          });
        }
      } catch (e) {
        console.warn(`解析 remotecache.vdf 失败 (${appId}):`, e);
      }
    }
  }));

  // 同步聚合到 Map (key -> { root, dirPath, files: [] })
  // 这里只保存元数据，不涉及 IO
  const rawMap = new Map();
  // eslint-disable-next-line no-restricted-syntax
  for (const { fileKey, fileInfo, appDir } of entries) {
    const rootType = parseInt(String(fileInfo.root), 10);
    const filePath = fileKey.replace(/\\/g, '/');
    const dirPath = path.dirname(filePath);
    const key = `${rootType}:${dirPath}`;

    if (!rawMap.has(key)) {
      rawMap.set(key, {
        root: rootType,
        relativePath: dirPath,
        files: [],
        appDir, // 需要这个来解析 root=0
      });
    }
    rawMap.get(key).files.push(path.basename(filePath));
  }

  // 并行解析绝对路径
  const result = await Promise.all(Array.from(rawMap.values()).map(async (item) => {
    let absolutePath = null;
    const { root, relativePath: dirPath, appDir } = item;

    switch (root) {
      case 1: // 游戏安装目录
        if (gameInstallDir) {
          absolutePath = path.join(gameInstallDir, dirPath);
        }
        break;
      case 2: // Documents
        absolutePath = path.join(documentsPath, dirPath);
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
      case 0: // Steam Cloud remote 目录
      default:
        absolutePath = path.join(appDir, 'remote', dirPath);
        break;
    }

    return {
      root,
      relativePath: dirPath,
      absolutePath,
      files: item.files,
    };
  }));

  return result;
}
