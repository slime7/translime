import {
  getSteamPath,
  scanInstalledGames,
  getSteamUserIds,
  findSavePaths,
} from './utils/steam';
import {
  backupSave,
  getBackups,
  restoreSave,
  getBackupCount,
  deleteBackup,
  updateBackupNote,
} from './utils/backup';

const id = 'translime-plugin-steam-save-backup';
const { mainStore } = global;
const config = mainStore?.config;
let steamPath = null;

// 从设置中获取排除列表
const getExcludeList = () => {
  if (!config) {
    return [];
  }
  const val = config.get(`plugin.${id}.settings.excludeList`, []);
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
  config.set(`plugin.${id}.settings.excludeList`, list);
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
    key: 'excludeList',
    type: 'input',
    name: '排除列表 (AppID, 逗号分隔)',
    placeholder: '例如: 730, 570',
  },
];

// 加载时执行
export const pluginDidLoad = async () => {
  console.log(`${id} loaded`);
  const settings = config?.get(`plugin.${id}.settings`, {}) || {};

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
  console.log(`${id} unloaded`);
};

// IPC 定义
export const ipcHandlers = [
  {
    type: 'scan-games',
    handler: ({ sendToClient }) => async () => {
      const settings = config?.get(`plugin.${id}.settings`, {}) || {};
      const currentSteamPath = settings.customSteamPath || await getSteamPath();

      if (!currentSteamPath) {
        sendToClient(`scan-games-reply@${id}`, { success: false, message: '未找到 Steam' });
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
          const backupCount = await getBackupCount(game.appid);
          // eslint-disable-next-line no-param-reassign
          game.savePaths = savePaths;
          // eslint-disable-next-line no-param-reassign
          game.backupCount = backupCount;
        }));

        const userIds = await getSteamUserIds(currentSteamPath);
        sendToClient(`scan-games-reply@${id}`, {
          success: true, games, userIds, steamPath: currentSteamPath,
        });
      } catch (e) {
        console.error('扫描游戏失败：', e);
        sendToClient(`scan-games-reply@${id}`, { success: false, message: e.message });
      }
    },
  },
  {
    type: 'get-backups',
    handler: ({ sendToClient }) => async (gameId) => {
      try {
        const backups = await getBackups(gameId);
        sendToClient(`get-backups-reply@${id}`, { success: true, backups });
      } catch (e) {
        sendToClient(`get-backups-reply@${id}`, { success: false, message: e.message });
      }
    },
  },
  {
    type: 'backup-save',
    handler: ({ sendToClient }) => async ({ gameId, gameName, savePaths }) => {
      try {
        const result = await backupSave(gameId, gameName, savePaths);
        sendToClient(`backup-save-reply@${id}`, result);
      } catch (e) {
        sendToClient(`backup-save-reply@${id}`, { success: false, message: e.message });
      }
    },
  },
  {
    type: 'restore-save',
    handler: ({ sendToClient }) => async (backupPath) => {
      try {
        const result = await restoreSave(backupPath);
        sendToClient(`restore-save-reply@${id}`, result);
      } catch (e) {
        sendToClient(`restore-save-reply@${id}`, { success: false, message: e.message });
      }
    },
  },
  {
    type: 'delete-backup',
    handler: ({ sendToClient }) => async (backupPath) => {
      try {
        const result = await deleteBackup(backupPath);
        sendToClient(`delete-backup-reply@${id}`, result);
      } catch (e) {
        sendToClient(`delete-backup-reply@${id}`, { success: false, message: e.message });
      }
    },
  },
  {
    type: 'exclude-game',
    handler: ({ sendToClient }) => async (appid) => {
      try {
        const excludeList = getExcludeList();
        const appidStr = String(appid);
        if (!excludeList.includes(appidStr)) {
          excludeList.push(appidStr);
          saveExcludeList(excludeList);
        }
        sendToClient(`exclude-game-reply@${id}`, { success: true, appid: appidStr });
      } catch (e) {
        sendToClient(`exclude-game-reply@${id}`, { success: false, message: e.message });
      }
    },
  },
  {
    type: 'include-game',
    handler: ({ sendToClient }) => async (appid) => {
      try {
        let excludeList = getExcludeList();
        const appidStr = String(appid);
        if (excludeList.includes(appidStr)) {
          excludeList = excludeList.filter((id) => id !== appidStr);
          saveExcludeList(excludeList);
        }
        sendToClient(`include-game-reply@${id}`, { success: true, appid: appidStr });
      } catch (e) {
        sendToClient(`include-game-reply@${id}`, { success: false, message: e.message });
      }
    },
  },
  {
    type: 'update-backup-note',
    handler: ({ sendToClient }) => async ({ backupPath, note }) => {
      try {
        const result = await updateBackupNote(backupPath, note);
        sendToClient(`update-backup-note-reply@${id}`, { success: true, ...result });
      } catch (e) {
        sendToClient(`update-backup-note-reply@${id}`, { success: false, message: e.message });
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
