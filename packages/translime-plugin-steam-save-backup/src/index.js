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
} from './utils/backup';

const id = 'translime-plugin-steam-save-backup';
let steamPath = null;

// 加载时执行
const pluginDidLoad = async () => {
  console.log(`${id} loaded`);
  steamPath = await getSteamPath();
  if (!steamPath) {
    console.warn('未找到 Steam 路径！');
  } else {
    console.log('发现 Steam 路径：', steamPath);
  }
};

// 禁用时执行
const pluginWillUnload = () => {
  console.log(`${id} unloaded`);
};

// IPC 定义
const ipcHandlers = [
  {
    type: 'scan-games',
    handler: ({ sendToClient }) => async () => {
      if (!steamPath) {
        steamPath = await getSteamPath();
      }
      if (!steamPath) {
        sendToClient(`scan-games-reply@${id}`, { success: false, message: '未找到 Steam' });
        return;
      }

      try {
        const games = await scanInstalledGames(steamPath);
        // 为每个游戏查找可能的存档路径
        await Promise.all(games.map(async (game) => {
          const savePaths = await findSavePaths(steamPath, game.appid);
          const backupCount = await getBackupCount(game.appid);
          // eslint-disable-next-line no-param-reassign
          game.savePaths = savePaths;
          // eslint-disable-next-line no-param-reassign
          game.backupCount = backupCount;
        }));

        const userIds = await getSteamUserIds(steamPath);
        sendToClient(`scan-games-reply@${id}`, {
          success: true, games, userIds, steamPath,
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
];

export default {
  pluginDidLoad,
  pluginWillUnload,
  ipcHandlers,
};
