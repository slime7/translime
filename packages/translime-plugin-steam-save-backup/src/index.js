import { shell } from 'electron';
import path from 'node:path';
import { ensureDir, pathExists, stat } from './utils/fs-wrapper';
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
import {
  createCustomDirectorySource,
  saveSourcesToSavePaths,
  steamSavePathsToSaveSources,
} from './utils/save-sources';
import {
  hashGameKey,
  listDirFiles,
  normalizeCustomDir,
  normalizeGameNameKey,
} from './utils/custom-dirs';
import createSyncService from './utils/sync/sync-service';
import { createExec } from './utils/sync/rclone';
import {
  BACKEND_TYPES,
  createRemote,
  findBackendType,
  listRemotes,
  remoteNameFor,
  runAuthorize,
} from './utils/sync/rclone-config';

const pluginId = 'translime-plugin-steam-save-backup';
const { mainStore } = global;
const config = mainStore?.config;
let steamPath = null;
// 进行中的 OAuth 授权进程（sync-cancel-authorize 取消用）
let currentAuthorize = null;

// 表单值填充后端默认值，只保留非空项
const mergeFieldValues = (backend, rawValues = {}) => {
  const merged = {};
  (backend.fields || []).forEach((field) => {
    const raw = String(rawValues?.[field.key] ?? '').trim();
    merged[field.key] = raw || (field.default != null ? String(field.default) : '');
  });
  return merged;
};

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

const syncService = createSyncService({
  pluginId,
  getConfig: (key, defaultValue) => config?.get(key, defaultValue),
  setConfig: (key, value) => {
    config?.set(key, value);
  },
  resolveBackupRoot: async () => {
    const settings = config?.get(`plugin.${pluginId}.settings`, {}) || {};
    return resolveBackupRoot(getPathSetting(settings, 'customBackupRoot'));
  },
});

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

// 读取手动添加的自定义存档目录列表 [{ gameName, dir }]
const getCustomSaveDirs = () => {
  if (!config) {
    return [];
  }
  const val = config.get(`plugin.${pluginId}.settings.customSaveDirs`, []);
  if (!Array.isArray(val)) {
    return [];
  }
  return val
    .filter((entry) => entry && typeof entry.dir === 'string' && entry.dir
      && typeof entry.gameName === 'string' && entry.gameName.trim())
    .map((entry) => ({
      gameName: entry.gameName.trim(),
      dir: entry.dir,
    }));
};

const saveCustomSaveDirs = (list) => {
  if (!config) {
    return;
  }
  config.set(`plugin.${pluginId}.settings.customSaveDirs`, list);
};

// 为游戏构造自定义目录存档源（枚举目录内文件，目录缺失或为空时返回空数组）
const buildCustomDirSources = async (entries) => {
  const sources = await Promise.all(entries.map(async (entry) => {
    if (!(await pathExists(entry.dir))) {
      return null;
    }
    const { files } = await listDirFiles(entry.dir);
    if (files.length === 0) {
      return null;
    }
    return createCustomDirectorySource({
      id: `custom-directory:${normalizeCustomDir(entry.dir)}`,
      absolutePath: entry.dir,
      relativePath: '.',
      files,
      enabled: true,
      label: '自定义目录',
      metadata: {
        gameName: entry.gameName,
      },
    });
  }));
  return sources.filter(Boolean);
};

// 按游戏名取出手动目录条目，并记录哪些名字命中了扫描列表
const takeMatchedCustomDirs = (gameName, customDirs, matchedKeys) => {
  const key = normalizeGameNameKey(gameName);
  const entries = customDirs.filter((entry) => normalizeGameNameKey(entry.gameName) === key);
  if (entries.length > 0) {
    matchedKeys.add(key);
  }
  return entries;
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

  // 激活后延迟对账，不阻塞加载（docs/auto-sync-research.md §5 NAS 掉线风险）
  syncService.onActivated();
};

// 禁用时执行
export const pluginWillUnload = () => {
  console.log(`${pluginId} unloaded`);
  syncService.dispose();
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

        const customDirs = getCustomSaveDirs();
        const matchedCustomKeys = new Set();

        // 为每个游戏查找可能的存档路径，并按游戏名合并手动添加的自定义目录
        await Promise.all(games.map(async (game) => {
          const savePaths = await findSavePaths(currentSteamPath, game.appid);
          const saveSources = steamSavePathsToSaveSources(savePaths);
          const customEntries = takeMatchedCustomDirs(game.name, customDirs, matchedCustomKeys);
          const customSources = await buildCustomDirSources(customEntries);
          const backupCount = await getBackupCount(game.appid, backupRoot);
          // eslint-disable-next-line no-param-reassign
          game.savePaths = savePaths;
          // eslint-disable-next-line no-param-reassign
          game.saveSources = [...saveSources, ...customSources];
          // eslint-disable-next-line no-param-reassign
          game.backupCount = backupCount;
        }));

        // 未命中任何扫描游戏的手动条目 → 生成自定义游戏（支持非 Steam 游戏）
        const unmatchedGroups = new Map();
        customDirs.forEach((entry) => {
          const key = normalizeGameNameKey(entry.gameName);
          if (matchedCustomKeys.has(key)) {
            return;
          }
          if (!unmatchedGroups.has(key)) {
            unmatchedGroups.set(key, { gameName: entry.gameName, entries: [] });
          }
          unmatchedGroups.get(key).entries.push(entry);
        });

        const customGames = await Promise.all([...unmatchedGroups.values()].map(async (group) => {
          const appid = hashGameKey(group.gameName);
          return {
            appid,
            name: group.gameName,
            isCustom: true,
            installDir: null,
            libraryPath: null,
            savePaths: [],
            saveSources: await buildCustomDirSources(group.entries),
            backupCount: await getBackupCount(appid, backupRoot),
            excluded: excludeList.includes(appid),
          };
        }));
        games.push(...customGames);

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
    handler: () => async ({
      gameId,
      gameName,
      savePaths,
      saveSources,
    }) => {
      try {
        const settings = config?.get(`plugin.${pluginId}.settings`, {}) || {};
        const backupRoot = getPathSetting(settings, 'customBackupRoot');
        const normalizedSources = Array.isArray(saveSources)
          ? saveSources
          : steamSavePathsToSaveSources(savePaths);
        const pathsToBackup = saveSourcesToSavePaths(normalizedSources);
        const result = await backupSave(
          gameId,
          gameName,
          pathsToBackup,
          backupRoot,
          normalizedSources,
          { machineId: syncService.ensureMachineId() },
        );
        if (result.success) {
          // 备份完成后自动推送远端（docs/auto-sync-research.md §2 触发时机）
          syncService.onBackupCreated(gameId);
        }
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
    handler: () => async (payload) => {
      try {
        const isObject = payload !== null && typeof payload === 'object';
        const backupPath = isObject ? payload.backupPath : payload;
        const deleteRemote = Boolean(isObject && payload.deleteRemote);

        const result = await deleteBackup(backupPath);
        if (!result.success) {
          return result;
        }

        // 本地已删除；勾选“同时删除远程存档”时联动清理远端（备份目录与散落的整包 zip 都处理）
        let remoteDeleted = false;
        let warning = null;
        if (deleteRemote && syncService.isRemoteDeletionAvailable()) {
          const gameId = path.basename(path.dirname(backupPath));
          const dir = path.basename(backupPath);
          try {
            await syncService.removeRemoteBackup({ gameId, dir });
            remoteDeleted = true;
          } catch (remoteError) {
            warning = `远程删除失败：${remoteError.message}`;
            console.warn('删除远程备份失败：', remoteError);
          }
        }
        return { success: true, remoteDeleted, warning };
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
    type: 'add-custom-save-dir',
    handler: () => async ({ gameName, dir }) => {
      try {
        const normalizedGameName = typeof gameName === 'string' ? gameName.trim() : '';
        const normalizedDir = typeof dir === 'string' ? dir.trim() : '';

        if (!normalizedGameName) {
          return { success: false, message: '请填写游戏名称' };
        }
        if (!normalizedDir) {
          return { success: false, message: '请选择存档目录' };
        }

        let stats = null;
        try {
          stats = await stat(normalizedDir);
        } catch {
          stats = null;
        }
        if (!stats || !stats.isDirectory()) {
          return { success: false, message: '目录不存在或不可访问' };
        }

        const { files } = await listDirFiles(normalizedDir);
        if (files.length === 0) {
          return { success: false, message: '该目录下没有文件，无法作为存档目录' };
        }

        const list = getCustomSaveDirs();
        const nameKey = normalizeGameNameKey(normalizedGameName);
        const dirKey = normalizeCustomDir(normalizedDir);
        if (list.some((entry) => normalizeGameNameKey(entry.gameName) === nameKey
          && normalizeCustomDir(entry.dir) === dirKey)) {
          return { success: false, message: '该游戏的此目录已添加过' };
        }

        list.push({
          gameName: normalizedGameName,
          dir: normalizedDir,
        });
        saveCustomSaveDirs(list);

        return { success: true, customDirs: list };
      } catch (e) {
        console.error('添加自定义存档目录失败：', e);
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'remove-custom-save-dir',
    handler: () => async ({ gameName, dir }) => {
      try {
        const nameKey = normalizeGameNameKey(typeof gameName === 'string' ? gameName : '');
        const dirKey = normalizeCustomDir(typeof dir === 'string' ? dir : '');
        if (!nameKey || !dirKey) {
          return { success: false, message: '参数不完整' };
        }

        const list = getCustomSaveDirs();
        const next = list.filter(
          (entry) => !(normalizeGameNameKey(entry.gameName) === nameKey
            && normalizeCustomDir(entry.dir) === dirKey),
        );
        if (next.length === list.length) {
          return { success: false, message: '未找到该自定义目录' };
        }
        saveCustomSaveDirs(next);

        return { success: true, customDirs: next };
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
  {
    type: 'sync-get-status',
    handler: () => async () => ({ success: true, status: syncService.getStatus() }),
  },
  {
    type: 'sync-set-config',
    handler: () => async (syncConfig) => {
      try {
        if (!syncConfig || typeof syncConfig !== 'object') {
          return { success: false, message: '参数不完整' };
        }
        if (syncConfig.enabled && !String(syncConfig.target || '').trim()) {
          return { success: false, message: '启用同步前需要填写远程目标' };
        }
        syncService.setSyncConfig(syncConfig);
        // 启用并保存后立即对账一次，让状态尽快可见；未启用时 trigger 被 canRun 忽略
        syncService.trigger('manual');
        return { success: true, status: syncService.getStatus() };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'sync-check-rclone',
    handler: () => async ({ rclonePath } = {}) => {
      try {
        const probe = await syncService.checkRclone(rclonePath);
        return { success: probe.ok, rclone: probe };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'sync-now',
    handler: () => async () => {
      try {
        const status = syncService.getStatus();
        if (!status.config.enabled || !status.config.target) {
          return { success: false, message: '请先在同步设置中启用并配置远程目标' };
        }
        const result = syncService.trigger('manual');
        if (result === 'ignored') {
          return { success: false, message: '请先在同步设置中启用并配置远程目标' };
        }
        return { success: true, result };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'sync-cancel',
    handler: () => async () => {
      syncService.cancel();
      return { success: true };
    },
  },
  {
    type: 'sync-list-remotes',
    handler: () => async () => {
      try {
        const binary = syncService.resolveBinaryPath();
        const exec = createExec(async () => binary);
        const remotes = await listRemotes(exec);
        return { success: true, remotes };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'sync-backend-types',
    handler: () => async () => ({ success: true, backends: BACKEND_TYPES }),
  },
  {
    type: 'sync-create-remote',
    handler: ({ sendToClient }) => async ({ type, values } = {}) => {
      try {
        const backend = findBackendType(type);
        if (!backend) {
          return { success: false, message: '不支持的后端类型' };
        }
        const missing = (backend.fields || [])
          .filter((field) => field.required && !String(values?.[field.key] ?? '').trim())
          .map((field) => field.label);
        if (missing.length > 0) {
          return { success: false, message: `请填写：${missing.join('、')}` };
        }

        const binary = syncService.resolveBinaryPath();
        const exec = createExec(async () => binary);

        let token = null;
        if (backend.auth === 'oauth') {
          // rclone 会自动打开默认浏览器；授权链接同时推送给 UI 作为备用入口
          const authorize = runAuthorize(binary, type, {
            onUrl: (url) => {
              sendToClient(`sync-authorize-url@${pluginId}`, { url });
            },
          });
          currentAuthorize = authorize;
          try {
            token = await authorize.promise;
          } finally {
            currentAuthorize = null;
          }
        }

        const name = await createRemote(exec, {
          type,
          name: remoteNameFor(type),
          values: mergeFieldValues(backend, values),
          token,
        });
        return { success: true, remote: `${name}:` };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'sync-cancel-authorize',
    handler: () => async () => {
      if (currentAuthorize) {
        currentAuthorize.cancel();
        currentAuthorize = null;
      }
      return { success: true };
    },
  },
  {
    type: 'sync-resolve-conflict',
    handler: () => async ({ gameId, dir, mode } = {}) => {
      try {
        if (!gameId || !dir || !mode) {
          return { success: false, message: '参数不完整' };
        }
        const status = await syncService.resolveOneConflict({ gameId, dir, mode });
        return { success: true, status };
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
