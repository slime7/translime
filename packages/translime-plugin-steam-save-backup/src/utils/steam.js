import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  pathExists,
  readdir,
  readFile,
  stat,
} from './fs-wrapper';
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
    if (await pathExists(p)) {
      return p;
    }
    return null;
  }));

  const foundPath = pathChecks.find((p) => p !== null);
  if (foundPath) {
    return foundPath;
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

  if (await pathExists(libraryFoldersPath)) {
    try {
      const content = await readFile(libraryFoldersPath, 'utf8');
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
    if (!(await pathExists(steamappsPath))) {
      return [];
    }

    const files = await readdir(steamappsPath);
    const acfFiles = files.filter((f) => f.endsWith('.acf'));

    const gamesInLib = await Promise.all(acfFiles.map(async (file) => {
      try {
        const content = await readFile(path.join(steamappsPath, file), 'utf8');
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
  if (!(await pathExists(userdataDir))) {
    return [];
  }

  const files = await readdir(userdataDir);

  const results = await Promise.all(files.map(async (file) => {
    const stats = await stat(path.join(userdataDir, file));
    if (stats.isDirectory() && /^\d+$/.test(file)) {
      return file;
    }
    return null;
  }));

  return results.filter((id) => id !== null);
}

/**
 * Steam remotecache.vdf 中 root 值的映射
 * 数据来源：Steam SDK 内部枚举 ERemoteStorageFileRoot
 * https://github.com/emily33901/SteamStructs/blob/master/ERemoteStorageFileRoot.h
 * https://partner.steamgames.com/doc/features/cloud
 *
 * | Root ID | SDK 枚举名                                        | Root 名称                 | 路径                                                      |
 * |---------|---------------------------------------------------|---------------------------|------------------------------------------------------------|
 * | 0       | k_ERemoteStorageFileRootDefault                   | Default                   | {Steam}/userdata/{UID}/{AppID}/remote/                     |
 * | 1       | k_ERemoteStorageFileRootGameInstall               | GameInstall               | {SteamInstall}/steamapps/common/{Game}/                    |
 * | 2       | k_ERemoteStorageFileRootWinMyDocuments             | WinMyDocuments            | Win: %USERPROFILE%\Documents\                              |
 * | 3       | k_ERemoteStorageFileRootWinAppDataLocal            | WinAppDataLocal           | Win: %LOCALAPPDATA%\                                       |
 * | 4       | k_ERemoteStorageFileRootWinAppDataRoaming          | WinAppDataRoaming         | Win: %APPDATA%\                                            |
 * | 5       | k_ERemoteStorageFileRootSteamUserBaseStorage       | SteamUserBaseStorage      | (用途待验证)                                               |
 * | 6       | k_ERemoteStorageFileRootMacHome                    | MacHome                   | Mac: ~/                                                    |
 * | 7       | k_ERemoteStorageFileRootMacAppSupport              | MacAppSupport             | Mac: ~/Library/Application Support/                        |
 * | 8       | k_ERemoteStorageFileRootMacDocuments               | MacDocuments              | Mac: ~/Documents/                                          |
 * | 9       | k_ERemoteStorageFileRootWinSavedGames              | WinSavedGames             | Win: %USERPROFILE%\Saved Games\                            |
 * | 10      | k_ERemoteStorageFileRootWinProgramData             | WinProgramData            | Win: %PROGRAMDATA%\                                        |
 * | 11      | k_ERemoteStorageFileRootSteamCloudDocuments        | SteamCloudDocuments       | 见 SteamCloudDocuments 路径说明                            |
 * | 12      | k_ERemoteStorageFileRootWinAppDataLocalLow         | WinAppDataLocalLow        | Win: %LOCALAPPDATA%Low\                                    |
 * | 13      | k_ERemoteStorageFileRootMacCaches                  | MacCaches                 | Mac: ~/Library/Caches/                                     |
 * | 14      | k_ERemoteStorageFileRootLinuxHome                  | LinuxHome                 | Linux: ~/                                                  |
 * | 15      | k_ERemoteStorageFileRootLinuxXdgDataHome           | LinuxXdgDataHome          | Linux: $XDG_DATA_HOME/ (默认 ~/.local/share)               |
 * | 16      | k_ERemoteStorageFileRootLinuxXdgConfigHome         | LinuxXdgConfigHome        | Linux: $XDG_CONFIG_HOME/ (默认 ~/.config)                  |
 * | 17      | k_ERemoteStorageFileRootAndroidSteamPackageRoot    | AndroidSteamPackageRoot   | Android: (待验证)                                          |
 * | 18      | (枚举中未定义，可能为后续新增)                      | WindowsHome               | Win: %USERPROFILE%\                                        |
 *
 * SteamCloudDocuments (Root 11) 路径说明：
 *   Win:   %USERPROFILE%\Documents\Steam Cloud\[Steam用户名]\[游戏名]\
 *   Mac:   ~/Documents/Steam Cloud/[Steam用户名]/[游戏名]/
 *   Linux: ~/.SteamCloud/[Steam用户名]/[游戏名]/
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
 * 获取 SteamCloudDocuments 的基础路径（不含用户名和游戏名部分）
 * @returns {string|null} 基础路径
 */
function getSteamCloudDocumentsBase() {
  const userProfile = process.env.USERPROFILE || process.env.HOME || '';

  if (process.platform === 'win32') {
    return path.join(userProfile, 'Documents', 'Steam Cloud');
  }
  if (process.platform === 'darwin') {
    return path.join(process.env.HOME || '', 'Documents', 'Steam Cloud');
  }
  if (process.platform === 'linux') {
    return path.join(process.env.HOME || '', '.SteamCloud');
  }
  return null;
}

/**
 * 根据 root 类型解析绝对路径
 * @param {number} root - root 类型 ID
 * @param {string} dirPath - 相对目录路径
 * @param {Object} ctx - 解析上下文
 * @param {string} ctx.appDir - userdata 下的应用目录
 * @param {string|null} ctx.gameInstallDir - 游戏安装目录
 * @param {string} ctx.steamPath - Steam 安装根路径
 * @returns {string|null} 解析后的绝对路径
 */
function resolveRootPath(root, dirPath, ctx) {
  const userProfile = process.env.USERPROFILE || process.env.HOME || '';

  switch (root) {
  case 0: // Default - Steam Cloud remote 目录
    return path.join(ctx.appDir, 'remote', dirPath);

  case 1: // GameInstall - 游戏安装目录
    if (ctx.gameInstallDir) {
      return path.join(ctx.gameInstallDir, dirPath);
    }
    return null;

  case 2: // WinMyDocuments
    return path.join(userProfile, 'Documents', dirPath);

  case 3: // WinAppDataLocal
    return path.join(
      process.env.LOCALAPPDATA || path.join(userProfile, 'AppData', 'Local'),
      dirPath,
    );

  case 4: // WinAppDataRoaming
    return path.join(
      process.env.APPDATA || path.join(userProfile, 'AppData', 'Roaming'),
      dirPath,
    );

    // case 5: SteamUserBaseStorage - 用途待验证，暂不实现

  case 6: // MacHome
    if (process.platform === 'darwin') {
      return path.join(process.env.HOME || '', dirPath);
    }
    return null;

  case 7: // MacAppSupport
    if (process.platform === 'darwin') {
      return path.join(process.env.HOME || '', 'Library', 'Application Support', dirPath);
    }
    return null;

  case 8: // MacDocuments
    if (process.platform === 'darwin') {
      return path.join(process.env.HOME || '', 'Documents', dirPath);
    }
    return null;

  case 9: // WinSavedGames
    return path.join(userProfile, 'Saved Games', dirPath);

  case 10: // WinProgramData
    return path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', dirPath);

  case 11: { // SteamCloudDocuments
    // 路径格式：[文档目录]/Steam Cloud/[Steam用户名]/[游戏名]/
    // 由于无法直接获取 Steam 用户名和游戏名，通过扫描 Steam Cloud 目录匹配
    const basePath = getSteamCloudDocumentsBase();
    if (basePath) {
      return path.join(basePath, dirPath);
    }
    return null;
  }

  case 12: // WinAppDataLocalLow
    return path.join(userProfile, 'AppData', 'LocalLow', dirPath);

  case 13: // MacCaches
    if (process.platform === 'darwin') {
      return path.join(process.env.HOME || '', 'Library', 'Caches', dirPath);
    }
    return null;

  case 14: // LinuxHome
    if (process.platform === 'linux') {
      return path.join(process.env.HOME || '', dirPath);
    }
    return null;

  case 15: // LinuxXdgDataHome
    if (process.platform === 'linux') {
      return path.join(
        process.env.XDG_DATA_HOME || path.join(process.env.HOME || '', '.local', 'share'),
        dirPath,
      );
    }
    return null;

  case 16: // LinuxXdgConfigHome
    if (process.platform === 'linux') {
      return path.join(
        process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || '', '.config'),
        dirPath,
      );
    }
    return null;

    // case 17: AndroidSteamPackageRoot - Android 专用，暂不实现

  case 18: // WindowsHome
    return path.join(userProfile, dirPath);

  default:
    console.warn(`未知的 root 类型: ${root}，回退到 Steam Cloud remote 目录`);
    return path.join(ctx.appDir, 'remote', dirPath);
  }
}

/**
 * 尝试查找游戏的存档路径
 * 通过解析 userdata 下的 remotecache.vdf 获取
 * @param {string} steamPath - Steam 安装路径
 * @param {string} appId - 游戏的 App ID
 * @param {string} [gameInstallDir] - 游戏安装目录（用于解析 root=1 的路径）
 * @returns {Promise<SavePathInfo[]>} 存档路径信息列表
 */
export async function findSavePaths(steamPath, appId, gameInstallDir = null) {
  const userIds = await getSteamUserIds(steamPath);

  // 收集所有需要处理的文件条目
  const entries = [];
  await Promise.all(userIds.map(async (userId) => {
    const appDir = path.join(steamPath, 'userdata', userId, appId);
    const remoteCachePath = path.join(appDir, 'remotecache.vdf');

    if (await pathExists(remoteCachePath)) {
      try {
        const content = await readFile(remoteCachePath, 'utf8');
        const data = vdfParse(content);
        const appData = data[appId];
        if (appData) {
          Object.entries(appData).forEach(([fileKey, fileInfo]) => {
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
        appDir,
      });
    }
    rawMap.get(key).files.push(path.basename(filePath));
  }

  // 并行解析绝对路径并验证存在性
  const result = await Promise.all(Array.from(rawMap.values()).map(async (item) => {
    const { root, relativePath: dirPath, appDir } = item;
    const absolutePath = resolveRootPath(root, dirPath, {
      appDir,
      gameInstallDir,
      steamPath,
    });

    return {
      root,
      relativePath: dirPath,
      absolutePath,
      files: item.files,
    };
  }));

  return result;
}

