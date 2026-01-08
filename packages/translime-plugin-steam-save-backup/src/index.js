import { shell } from 'electron';
import fs from './utils/fs-wrapper';
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
  if (!config) return;
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

  if (settings.customSteamPath) {
    steamPath = settings.customSteamPath;
    console.log('使用自定义 Steam 路径：', steamPath);
  } else {
    steamPath = await getSteamPath();
    if (!steamPath) {
      console.warn('未找到 Steam 路径！');
    } else {
      console.log('自动发现 Steam 路径：', steamPath);
    }
  }
};

// 禁用时执行
export const pluginWillUnload = () => {
  console.log(`${pluginId} unloaded`);
};

// IPC 定义
export const ipcHandlers = [
  {
    type: 'scan-games',
    handler: ({ sendToClient }) => async (params, sender) => {
      const settings = config?.get(`plugin.${pluginId}.settings`, {}) || {};
      const currentSteamPath = settings.customSteamPath || await getSteamPath();
      const backupRoot = settings.customBackupRoot;

      if (!currentSteamPath) {
        sendToClient(`scan-games-reply@${pluginId}`, { success: false, message: '未找到 Steam' }, sender);
        return;
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
        sendToClient(`scan-games-reply@${pluginId}`, {
          success: true, games, userIds, steamPath: currentSteamPath,
        }, sender);
      } catch (e) {
        console.error('扫描游戏失败：', e);
        sendToClient(`scan-games-reply@${pluginId}`, { success: false, message: e.message }, sender);
      }
    },
  },
  {
    type: 'get-backups',
    handler: ({ sendToClient }) => async (gameId, sender) => {
      try {
        const settings = config?.get(`plugin.${pluginId}.settings`, {}) || {};
        const backupRoot = settings.customBackupRoot;
        const backups = await getBackups(gameId, backupRoot);
        sendToClient(`get-backups-reply@${pluginId}`, { success: true, backups }, sender);
      } catch (e) {
        sendToClient(`get-backups-reply@${pluginId}`, { success: false, message: e.message }, sender);
      }
    },
  },
  {
    type: 'backup-save',
    handler: ({ sendToClient }) => async ({ gameId, gameName, savePaths }, sender) => {
      try {
        const settings = config?.get(`plugin.${pluginId}.settings`, {}) || {};
        const backupRoot = settings.customBackupRoot;
        const result = await backupSave(gameId, gameName, savePaths, backupRoot);
        sendToClient(`backup-save-reply@${pluginId}`, result, sender);
      } catch (e) {
        sendToClient(`backup-save-reply@${pluginId}`, { success: false, message: e.message }, sender);
      }
    },
  },
  {
    type: 'restore-save',
    handler: ({ sendToClient }) => async (backupPath, sender) => {
      try {
        const result = await restoreSave(backupPath);
        sendToClient(`restore-save-reply@${pluginId}`, result, sender);
      } catch (e) {
        sendToClient(`restore-save-reply@${pluginId}`, { success: false, message: e.message }, sender);
      }
    },
  },
  {
    type: 'delete-backup',
    handler: ({ sendToClient }) => async (backupPath, sender) => {
      try {
        const result = await deleteBackup(backupPath);
        sendToClient(`delete-backup-reply@${pluginId}`, result, sender);
      } catch (e) {
        sendToClient(`delete-backup-reply@${pluginId}`, { success: false, message: e.message }, sender);
      }
    },
  },
  {
    type: 'exclude-game',
    handler: ({ sendToClient }) => async (appid, sender) => {
      try {
        const excludeList = getExcludeList();
        const appidStr = String(appid);
        if (!excludeList.includes(appidStr)) {
          excludeList.push(appidStr);
          saveExcludeList(excludeList);
        }
        sendToClient(`exclude-game-reply@${pluginId}`, { success: true, appid: appidStr }, sender);
      } catch (e) {
        sendToClient(`exclude-game-reply@${pluginId}`, { success: false, message: e.message }, sender);
      }
    },
  },
  {
    type: 'include-game',
    handler: ({ sendToClient }) => async (appid, sender) => {
      try {
        let excludeList = getExcludeList();
        const appidStr = String(appid);
        if (excludeList.includes(appidStr)) {
          excludeList = excludeList.filter((id) => id !== appidStr);
          saveExcludeList(excludeList);
        }
        sendToClient(`include-game-reply@${pluginId}`, { success: true, appid: appidStr }, sender);
      } catch (e) {
        sendToClient(`include-game-reply@${pluginId}`, { success: false, message: e.message }, sender);
      }
    },
  },
  {
    type: 'update-backup-note',
    handler: ({ sendToClient }) => async ({ backupPath, note }, sender) => {
      try {
        const result = await updateBackupNote(backupPath, note);
        sendToClient(`update-backup-note-reply@${pluginId}`, { success: true, ...result }, sender);
      } catch (e) {
        sendToClient(`update-backup-note-reply@${pluginId}`, { success: false, message: e.message }, sender);
      }
    },
  },
  {
    type: 'open-backup-dir',
    handler: ({ sendToClient }) => async (params, sender) => {
      try {
        const settings = config?.get(`plugin.${pluginId}.settings`, {}) || {};
        const backupRoot = settings.customBackupRoot;
        const root = await resolveBackupRoot(backupRoot);

        // 确保目录存在，避免 shell.openPath 报错
        await fs.ensureDir(root);
        const error = await shell.openPath(root);

        if (error) {
          console.error('Failed to open backup directory:', error);
          sendToClient(`open-backup-dir-reply@${pluginId}`, { success: false, message: error }, sender);
        } else {
          sendToClient(`open-backup-dir-reply@${pluginId}`, { success: true }, sender);
        }
      } catch (e) {
        sendToClient(`open-backup-dir-reply@${pluginId}`, { success: false, message: e.message }, sender);
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
