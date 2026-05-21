import { shell } from 'electron';
import { ensureDir } from './utils/fs-wrapper';
import {
  findSavePaths,
  getSteamPath,
  getSteamUserIds,
  scanInstalledGames,
} from './utils/steam';
import {
  backupSave,
  deleteBackup,
  getBackupCount,
  getBackups,
  resolveBackupRoot,
  restoreSave,
  updateBackupNote,
} from './utils/backup';

const pluginId = 'translime-plugin-steam-save-backup';
const { mainStore } = global;
const config = mainStore?.config;
let steamPath = null;

const getPathSetting = (settings, key) => {
  const value = settings?.[key];
  if (Array.isArray(value)) {
    return value[0] || '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
};

// 从设置中获取排除列表
const getExcludeList = () => {
  if (!config) {
    return [];
  }
  const val = config.get(`plugin.${pluginId}.settings.excludeList`, []);
  if (Array.isArray(val)) {
    return val.map((v) => String(v));
  }
  if (typeof val === 'string') {
    return val.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
};

// 保存排除列表
const saveExcludeList = (list) => {
  if (!config) {
    return;
  }
  // 保持为数组存储，但在设置界面可能显示为逗号分隔字符串（取决于 Translime 实现）
  config.set(`plugin.${pluginId}.settings.excludeList`, list);
};

// 插件设置菜单
export const settingMenu = [
  {
    key: 'customSteamPath',
    type: 'file',
    name: '自定义 Steam 安装路径',
    required: false,
    valueType: 'string',
    placeholder: '留空则自动检测 (例如: C:\\Program Files (x86)\\Steam)',
    dialogOptions: {
      properties: ['openDirectory', 'dontAddToRecent'],
    },
  },
  {
    key: 'customBackupRoot',
    type: 'file',
    name: '自定义备份存储位置',
    required: false,
    valueType: 'string',
    placeholder: '留空则使用默认位置',
    dialogOptions: {
      properties: ['openDirectory', 'dontAddToRecent'],
    },
  },
  {
    key: 'excludeList',
    type: 'input',
    name: '排除列表 (AppID, 逗号分隔)',
    placeholder: '例如: 730, 570',
  },
];

// 加载时执行
export const pluginDidLoad = async () => {
  console.log(`${pluginId} loaded`);
  const settings = config?.get(`plugin.${pluginId}.settings`, {}) || {};
  const customSteamPath = getPathSetting(settings, 'customSteamPath');

  if (customSteamPath) {
    steamPath = customSteamPath;
    console.log('使用自定义 Steam 路径：', steamPath);
  }
};

// 禁用时执行
export const pluginWillUnload = () => {
  console.log(`${pluginId} unloaded`);
};

// IPC 定义 - 使用 invoke 模式，直接返回结果
export const ipcHandlers = [
  {
    type: 'scan-games',
    handler: () => async () => {
      const settings = config?.get(`plugin.${pluginId}.settings`, {}) || {};
      const currentSteamPath = getPathSetting(settings, 'customSteamPath') || await getSteamPath();
      const backupRoot = getPathSetting(settings, 'customBackupRoot');

      if (!currentSteamPath) {
        return { success: false, message: '未找到 Steam' };
      }

      try {
        const games = await scanInstalledGames(currentSteamPath);

        // 获取排除列表并标记
        const excludeList = getExcludeList();
        games.forEach((g) => {
          // eslint-disable-next-line no-param-reassign
          g.excluded = excludeList.includes(String(g.appid));
        });

        // 为每个游戏查找可能的存档路径
        await Promise.all(games.map(async (game) => {
          const savePaths = await findSavePaths(currentSteamPath, game.appid);
          const backupCount = await getBackupCount(game.appid, backupRoot);
          // eslint-disable-next-line no-param-reassign
          game.savePaths = savePaths;
          // eslint-disable-next-line no-param-reassign
          game.backupCount = backupCount;
        }));

        const userIds = await getSteamUserIds(currentSteamPath);
        return {
          success: true, games, userIds, steamPath: currentSteamPath,
        };
      } catch (e) {
        console.error('扫描游戏失败：', e);
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'get-backups',
    handler: () => async (gameId) => {
      try {
        const settings = config?.get(`plugin.${pluginId}.settings`, {}) || {};
        const backupRoot = getPathSetting(settings, 'customBackupRoot');
        const backups = await getBackups(gameId, backupRoot);
        return { success: true, backups };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'backup-save',
    handler: () => async ({ gameId, gameName, savePaths }) => {
      try {
        const settings = config?.get(`plugin.${pluginId}.settings`, {}) || {};
        const backupRoot = getPathSetting(settings, 'customBackupRoot');
        const result = await backupSave(gameId, gameName, savePaths, backupRoot);
        return result;
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'restore-save',
    handler: () => async (backupPath) => {
      try {
        const result = await restoreSave(backupPath);
        return result;
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'delete-backup',
    handler: () => async (backupPath) => {
      try {
        const result = await deleteBackup(backupPath);
        return result;
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'exclude-game',
    handler: () => async (appid) => {
      try {
        const excludeList = getExcludeList();
        const appidStr = String(appid);
        if (!excludeList.includes(appidStr)) {
          excludeList.push(appidStr);
          saveExcludeList(excludeList);
        }
        return { success: true, appid: appidStr };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'include-game',
    handler: () => async (appid) => {
      try {
        let excludeList = getExcludeList();
        const appidStr = String(appid);
        if (excludeList.includes(appidStr)) {
          excludeList = excludeList.filter((id) => id !== appidStr);
          saveExcludeList(excludeList);
        }
        return { success: true, appid: appidStr };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'update-backup-note',
    handler: () => async ({ backupPath, note }) => {
      try {
        const result = await updateBackupNote(backupPath, note);
        return { success: true, ...result };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'open-backup-dir',
    handler: () => async () => {
      try {
        const settings = config?.get(`plugin.${pluginId}.settings`, {}) || {};
        const backupRoot = getPathSetting(settings, 'customBackupRoot');
        const root = await resolveBackupRoot(backupRoot);

        // 确保目录存在，避免 shell.openPath 报错

        await ensureDir(root);
        const error = await shell.openPath(root);

        if (error) {
          console.error('Failed to open backup directory:', error);
          return { success: false, message: error };
        }
        return { success: true };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
];

export default {
  pluginDidLoad,
  pluginWillUnload,
  ipcHandlers,
  settingMenu,
};
