import { shell } from 'electron';
import path from 'node:path';
import { setTitleBarActions, useLogger } from 'translime-sdk';
import {
  ensureDir, pathExists, readJson, stat,
} from './utils/fs-wrapper';
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
import { listGhostGames, upsertKnownGames } from './utils/known-games';
import cleanupCustomDirBackups from './utils/custom-dir-removal';
import createSyncService from './utils/sync/sync-service';
import createPassthroughService from './utils/passthrough/service';
import createSaveWatcher from './utils/save-watcher';
import createAutoBackupScheduler from './utils/auto-backup';
import createFullscreenWatcher from './utils/fullscreen-watcher';
import { discoverSmbHostName } from './utils/sync/netbios';
import { createExec } from './utils/sync/rclone';
import {
  BACKEND_TYPES,
  checkRemoteConnection,
  createRemote,
  deleteRemote,
  findBackendType,
  getRemoteConfig,
  listRemotes,
  remoteNameFor,
  runAuthorize,
  updateRemote,
} from './utils/sync/rclone-config';

const pluginId = 'translime-plugin-steam-save-backup';
const { mainStore } = global;
const config = mainStore?.config;
const logger = useLogger();
let steamPath = null;
// 进行中的 OAuth 授权进程（sync-cancel-authorize 取消用）
let currentAuthorize = null;

// 表单值填充后端默认值，只保留非空项；密码不 trim（密码本身可能包含空格）
const mergeFieldValues = (backend, rawValues = {}) => {
  const merged = {};
  (backend.fields || []).forEach((field) => {
    const raw = String(rawValues?.[field.key] ?? '');
    let value = raw.trim();
    if (field.type === 'password' && value) {
      value = raw;
    }
    merged[field.key] = value || (field.default != null ? String(field.default) : '');
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

// 已登记游戏的云存档配置注册表（appid → { appid, name, savePaths }）：
// 游戏卸载后扫描不到，凭登记条目仍可列出并管理其存档备份
const getKnownGames = () => {
  if (!config) {
    return {};
  }
  const val = config.get(`plugin.${pluginId}.settings.knownGames`, {});
  if (!val || typeof val !== 'object' || Array.isArray(val)) {
    return {};
  }
  return val;
};

const saveKnownGames = (knownGames) => {
  if (!config) {
    return;
  }
  config.set(`plugin.${pluginId}.settings.knownGames`, knownGames);
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

// 渲染端消息推送（UI 打开后由 IPC handler 捕获；未打开时通知仅落入持久状态）
let clientSender = null;
const captureClient = (sendToClient) => {
  clientSender = sendToClient;
};
const notifyClient = (payload) => {
  if (!clientSender) {
    return;
  }
  try {
    // 延迟上下文（同步队列/文件监控/顶栏动作）里 ALS 已失效，sendToClient 会退回主窗口
    // sender；显式广播到所有窗口，插件 webview 按自身通道过滤，其他窗口无监听不受影响
    clientSender(`sync-notify@${pluginId}`, payload, 'all');
  } catch (e) {
    logger.warn('推送同步通知失败：', e);
  }
};

const passthroughService = createPassthroughService({
  pluginId,
  getConfig: (key, defaultValue) => config?.get(key, defaultValue),
  setConfig: (key, value) => {
    config?.set(key, value);
  },
  getMachineId: () => syncService.ensureMachineId(),
  resolveBinary: () => syncService.resolveBinaryPath(),
  onNotify: notifyClient,
});
syncService.setPassthrough(passthroughService);

// ============ 文件监控与自动同步 ============

// 参数集中定义便于调参：监控防抖/同步后静默宽限、自动备份防抖/每游戏冷却间隔
const WATCHER_DEBOUNCE_MS = 2000;
const WATCHER_QUIET_MS = 3000;
const AUTO_BACKUP_DEBOUNCE_MS = 3000;
const AUTO_BACKUP_COOLDOWN_MS = 10 * 60 * 1000;

// 最近一次构建的游戏列表：自动备份的数据源（scan-games 与后台预扫描都会填充）
let scannedGames = [];
// 目录 → 监控目标（passthrough / game），与 saveWatcher 的目录集合保持一致
let watchTargets = new Map();
// 递增代数：插件卸载（禁用/退出）后使在途的后台扫描结果失效
let unloadGeneration = 0;

// 自动备份：复用手动备份管线；成功后标记待上传并立即触发对账
// （未配置远程目标时队列自动忽略，仅保留本地备份）
const runAutoBackup = async (gameId) => {
  const game = scannedGames.find((item) => String(item.appid) === String(gameId));
  if (!game) {
    return;
  }
  const sources = (game.saveSources || []).filter((source) => source.enabled !== false);
  const pathsToBackup = saveSourcesToSavePaths(sources);
  if (pathsToBackup.length === 0) {
    return;
  }
  try {
    const settings = config?.get(`plugin.${pluginId}.settings`, {}) || {};
    const backupRoot = getPathSetting(settings, 'customBackupRoot');
    const result = await backupSave(
      game.appid,
      game.name,
      pathsToBackup,
      backupRoot,
      sources,
      { machineId: syncService.ensureMachineId() },
    );
    if (result.success) {
      syncService.markDirty(gameId);
      syncService.trigger();
      notifyClient({ kind: 'auto-backup', gameId: String(game.appid), gameName: game.name });
    }
  } catch (e) {
    logger.warn(`自动备份失败（${game.name}）：`, e);
  }
};

const autoBackup = createAutoBackupScheduler({
  debounceMs: AUTO_BACKUP_DEBOUNCE_MS,
  cooldownMs: AUTO_BACKUP_COOLDOWN_MS,
  run: runAutoBackup,
});

const handleSaveChange = (dir) => {
  const target = watchTargets.get(normalizeCustomDir(dir));
  if (!target) {
    return;
  }
  if (target.kind === 'passthrough') {
    // 直通目录变更：触发对账上传（对账运行中自动排队；回写抑制由引擎钩子负责）
    syncService.trigger();
    return;
  }
  autoBackup.notifyChange(target.gameId);
};

const saveWatcher = createSaveWatcher({
  debounceMs: WATCHER_DEBOUNCE_MS,
  quietMs: WATCHER_QUIET_MS,
  onChange: handleSaveChange,
  onError: (dir, e) => logger.warn(`存档目录监控失效：${dir}`, e?.message || e),
});

// 全屏程序（游戏）运行期间存档高频变动且用户无感知：整体挂起监控，
// 退出后由补发机制统一触发一次备份/同步。检测不可用时静默放弃该功能
const fullscreenWatcher = createFullscreenWatcher({
  onFullscreenChange: (fullscreen) => {
    logger.info(fullscreen ? '检测到全屏程序，暂停存档监控' : '全屏程序退出，恢复存档监控');
    if (fullscreen) {
      saveWatcher.pause();
    } else {
      saveWatcher.resume();
    }
  },
  onUnavailable: (e) => logger.warn('全屏检测不可用，游戏运行时暂停监控功能停用：', e?.message || e),
});

const refreshWatchTargets = () => {
  const targets = new Map();
  // 直通条目优先：同一目录同时是备份来源与直通条目时按直通处理（两块隔离，动作不叠加）
  passthroughService.getConfiguredEntries().forEach((entry) => {
    const key = normalizeCustomDir(entry.dir);
    if (key) {
      targets.set(key, { kind: 'passthrough' });
    }
  });
  scannedGames.filter((game) => !game.excluded).forEach((game) => {
    (game.saveSources || []).forEach((source) => {
      if (source.enabled === false || !source.absolutePath) {
        return;
      }
      const key = normalizeCustomDir(source.absolutePath);
      if (key && !targets.has(key)) {
        targets.set(key, { kind: 'game', gameId: String(game.appid), gameName: game.name });
      }
    });
  });
  watchTargets = targets;
  saveWatcher.setDirs([...targets.keys()]);
};

// 全量构建游戏列表（Steam 扫描 + 自定义目录合并 + 幽灵游戏），scan-games IPC 与后台预扫描共用。
// 返回 null 表示未找到 Steam；另返回 steamPath 供调用方复用
const buildGameList = async () => {
  const settings = config?.get(`plugin.${pluginId}.settings`, {}) || {};
  const currentSteamPath = getPathSetting(settings, 'customSteamPath') || await getSteamPath();
  const backupRoot = getPathSetting(settings, 'customBackupRoot');

  if (!currentSteamPath) {
    return null;
  }

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

  // 登记扫描到游戏的云存档配置；已卸载（不在扫描结果中）但登记过且本地仍有
  // 备份的游戏仍进入列表——saveSources 置空，仅保留还原 / 删除 / 同步管理能力
  const knownGames = upsertKnownGames(getKnownGames(), games);
  const ghostGames = await listGhostGames(knownGames, games, getBackupCount, backupRoot);
  games.push(...ghostGames.map((game) => ({
    ...game,
    excluded: excludeList.includes(game.appid),
  })));
  saveKnownGames(knownGames);

  return { games, steamPath: currentSteamPath };
};

// 随应用启动（onAppReady）后台预扫描：建立文件监控与自动备份数据源，无需打开插件页
const backgroundScan = () => {
  const generation = unloadGeneration;
  (async () => {
    try {
      const result = await buildGameList();
      if (!result || generation !== unloadGeneration) {
        return;
      }
      scannedGames = result.games;
      refreshWatchTargets();
    } catch (e) {
      logger.warn('后台预扫描失败：', e);
    }
  })();
};

// 打开备份根目录（宿主顶栏按钮与 open-backup-dir IPC 共用）
const openBackupRoot = async () => {
  try {
    const settings = config?.get(`plugin.${pluginId}.settings`, {}) || {};
    const backupRoot = getPathSetting(settings, 'customBackupRoot');
    const root = await resolveBackupRoot(backupRoot);

    // 确保目录存在，避免 shell.openPath 报错
    await ensureDir(root);
    const error = await shell.openPath(root);
    if (error) {
      logger.error('Failed to open backup directory:', error);
      return false;
    }
    return true;
  } catch (e) {
    logger.error('Failed to open backup directory:', e);
    return false;
  }
};

// 宿主插件页顶栏（inspect 旁）按钮区：备份区与直通区共用的公共操作。
// 同步设置对话框在插件 UI 内打开（webview 常驻，任意视图都能弹出）
const registerTitleBarActions = () => {
  const registered = setTitleBarActions(pluginId, [
    {
      label: '打开备份目录',
      icon: 'folder_open',
      iconOnly: true,
      click: () => {
        openBackupRoot();
      },
    },
    {
      label: '同步设置',
      icon: 'cloud_sync',
      iconOnly: true,
      click: () => {
        notifyClient({ kind: 'open-sync-settings' });
      },
    },
  ]);
  if (!registered) {
    logger.warn('顶栏按钮区注册失败：宿主不支持（需 translime >= 0.8.1，重启宿主开发进程）');
  }
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

// 加载时执行（onAppReady 常驻激活：应用启动即建立监控，自动备份/直通同步不依赖插件页）
export const pluginDidLoad = async () => {
  logger.info(`${pluginId} loaded`);
  const settings = config?.get(`plugin.${pluginId}.settings`, {}) || {};
  const customSteamPath = getPathSetting(settings, 'customSteamPath');

  if (customSteamPath) {
    steamPath = customSteamPath;
    logger.info('使用自定义 Steam 路径：', steamPath);
  }

  backgroundScan();
  fullscreenWatcher.start();
  registerTitleBarActions();
};

// 禁用时执行
export const pluginWillUnload = () => {
  logger.info(`${pluginId} unloaded`);
  unloadGeneration += 1;
  fullscreenWatcher.stop();
  saveWatcher.close();
  autoBackup.cancel();
  syncService.dispose();
  setTitleBarActions(pluginId, null);
};

// IPC 定义 - 使用 invoke 模式，直接返回结果
export const ipcHandlers = [
  {
    type: 'scan-games',
    handler: ({ sendToClient }) => async () => {
      captureClient(sendToClient);
      try {
        const result = await buildGameList();
        if (!result) {
          return { success: false, message: '未找到 Steam' };
        }

        // 记录扫描结果并重建文件监控集（自动备份与直通自动同步的数据源）
        scannedGames = result.games;
        refreshWatchTargets();

        const userIds = await getSteamUserIds(result.steamPath);
        return {
          success: true, games: result.games, userIds, steamPath: result.steamPath,
        };
      } catch (e) {
        logger.error('扫描游戏失败：', e);
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
          // 备份后只标记待上传，同步由用户在弹窗或同步设置中手动触发
          syncService.markDirty(gameId);
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
        const deleteRemoteFlag = Boolean(isObject && payload.deleteRemote);

        // 原备份元数据在本地删除前读取：远端墓碑（deleted 标记）需保留原信息
        let info = null;
        try {
          info = await readJson(path.join(backupPath, 'info.json'));
        } catch {
          info = null;
        }

        const result = await deleteBackup(backupPath);
        if (!result.success) {
          return result;
        }

        // 本地已删除；勾选“同时删除远程存档”时清理远端数据并写入删除墓碑，
        // 其他端对账时跟随删除，不再回补或重新上传
        let remoteDeleted = false;
        let warning = null;
        if (deleteRemoteFlag && syncService.isRemoteDeletionAvailable()) {
          const gameId = path.basename(path.dirname(backupPath));
          const dir = path.basename(backupPath);
          try {
            await syncService.removeRemoteBackup({ gameId, dir, info });
            remoteDeleted = true;
          } catch (remoteError) {
            warning = `远程删除失败：${remoteError.message}`;
            logger.warn('删除远程备份失败：', remoteError);
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
        // 排除的游戏不再监控自动备份
        refreshWatchTargets();
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
        // 恢复显示的游戏重新纳入自动备份监控
        refreshWatchTargets();
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
        // 目录并入扫描结果后才会被监控自动备份
        backgroundScan();

        return { success: true, customDirs: list };
      } catch (e) {
        logger.error('添加自定义存档目录失败：', e);
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'remove-custom-save-dir',
    handler: () => async ({
      gameName, dir, deleteBackups, deleteRemote: deleteRemoteFlag,
    } = {}) => {
      try {
        const nameKey = normalizeGameNameKey(typeof gameName === 'string' ? gameName : '');
        const dirKey = normalizeCustomDir(typeof dir === 'string' ? dir : '');
        if (!nameKey || !dirKey) {
          return { success: false, message: '参数不完整' };
        }

        const list = getCustomSaveDirs();
        const removedEntry = list.find(
          (entry) => normalizeGameNameKey(entry.gameName) === nameKey
            && normalizeCustomDir(entry.dir) === dirKey,
        );
        const next = list.filter(
          (entry) => !(normalizeGameNameKey(entry.gameName) === nameKey
            && normalizeCustomDir(entry.dir) === dirKey),
        );
        if (next.length === list.length) {
          return { success: false, message: '未找到该自定义目录' };
        }
        saveCustomSaveDirs(next);
        backgroundScan();

        // 可选清理：该自定义游戏在备份区的本地/远端备份（远端走墓碑，其他端跟随删除）。
        // gameId 用存储条目的原始名称计算，与 buildGameList 的自定义游戏 ID 保持一致
        const cleanup = await cleanupCustomDirBackups({
          gameId: hashGameKey(removedEntry.gameName),
          deleteBackups: Boolean(deleteBackups),
          deleteRemote: Boolean(deleteRemoteFlag),
          listBackups: (gameId) => getBackups(gameId),
          readBackupInfo: (backup) => readJson(path.join(backup.path, 'info.json')),
          deleteLocalBackup: (backup) => deleteBackup(backup.path),
          deleteRemoteBackup: ({ gameId, dir: backupDir, info }) => syncService.removeRemoteBackup({ gameId, dir: backupDir, info }),
        });
        const warnings = [...cleanup.warnings];
        if (cleanup.remoteDeleted) {
          // 墓碑需要同步给其他设备
          syncService.trigger();
        }

        return {
          success: true,
          customDirs: next,
          removedBackups: cleanup.removedBackups,
          remoteDeleted: cleanup.remoteDeleted,
          warnings,
        };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'open-backup-dir',
    handler: () => async () => ({ success: await openBackupRoot() }),
  },
  {
    type: 'sync-get-status',
    handler: ({ sendToClient }) => async () => {
      captureClient(sendToClient);
      return { success: true, status: syncService.getStatus() };
    },
  },
  {
    type: 'sync-set-config',
    handler: () => async (syncConfig) => {
      try {
        if (!syncConfig || typeof syncConfig !== 'object') {
          return { success: false, message: '参数不完整' };
        }
        syncService.setSyncConfig(syncConfig);
        // 保存只落盘，不触发同步；同步仅由「立即同步」或游戏备份弹窗中的「同步」按钮手动触发
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
        if (!status.config.target) {
          return { success: false, message: '请先在同步设置中配置远程目标' };
        }
        const result = syncService.trigger();
        if (result === 'ignored') {
          return { success: false, message: '请先在同步设置中配置远程目标' };
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
        const names = await listRemotes(exec);
        // 附带后端类型：主视图据此决定「修改」是否可用（OAuth 远程无可编辑表单字段）
        const remotes = await Promise.all(names.map(async (name) => {
          try {
            const remoteConfig = await getRemoteConfig(exec, name);
            return { name, type: remoteConfig.type };
          } catch {
            return { name, type: null };
          }
        }));
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
    handler: ({ sendToClient }) => async ({ type, values, editName } = {}) => {
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

        let name;
        if (editName && backend.auth === 'fields') {
          // 编辑既有远程：只更新表单提交的字段，未填写的密码保持原值
          name = await updateRemote(exec, {
            name: editName,
            type,
            values: mergeFieldValues(backend, values),
          });
        } else {
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

          name = await createRemote(exec, {
            type,
            name: remoteNameFor(type),
            values: mergeFieldValues(backend, values),
            token,
          });
        }
        return { success: true, remote: `${name}:` };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'sync-test-remote',
    handler: () => async ({ name, subPath } = {}) => {
      try {
        if (!name) {
          return { success: false, message: '参数不完整' };
        }
        const binary = syncService.resolveBinaryPath();
        const exec = createExec(async () => binary);
        // 连接测试是独立动作：目标带子路径（如 SMB 的共享名）才会触发真实认证，
        // 根路径列举在部分服务器上不校验凭据，结果不代表连接可用
        const target = subPath ? `${name}:${subPath}` : `${name}:`;
        const connection = await checkRemoteConnection(exec, target);
        if (connection.ok === false && connection.error
          && /logon is invalid|bad username|authentication/i.test(connection.error)) {
          const remoteConfig = await getRemoteConfig(exec, name).catch(() => null);
          if (remoteConfig && String(remoteConfig.user || '').includes('@') && !remoteConfig.domain) {
            // rclone 不拆分 user@domain；用户名含 @ 且未指定域时，获取目标 NetBIOS 机器名作为域重试认证
            const machineName = await discoverSmbHostName(String(remoteConfig.host || ''));
            if (machineName) {
              const updateResult = await exec(['config', 'update', name, `domain=${machineName}`, '--obscure']);
              if (updateResult.code === 0) {
                const retry = await checkRemoteConnection(exec, target);
                if (retry.ok) {
                  // 发现的域写入配置，并返回给渲染端回填输入框
                  return {
                    success: true,
                    connection: {
                      ok: true, error: null, note: `已自动补上域 ${machineName}`, domain: machineName,
                    },
                  };
                }
                // 重试仍失败：还原刚写入的域，按普通失败提示
                await exec(['config', 'unset', name, 'domain']);
              }
            }
            connection.error += '；用户名含 @ 时按 UPN 登录，需要在「域」中填写目标机器名（可在目标设备上运行 hostname 查看），或改用目标设备的本地账户名';
          }
        }
        return { success: true, connection };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'sync-get-remote',
    handler: () => async ({ name } = {}) => {
      try {
        if (!name) {
          return { success: false, message: '参数不完整' };
        }
        const binary = syncService.resolveBinaryPath();
        const exec = createExec(async () => binary);
        const remoteConfig = await getRemoteConfig(exec, name);
        const backend = findBackendType(remoteConfig.type);
        if (!backend) {
          return { success: false, message: `不支持的后端类型：${remoteConfig.type}` };
        }
        // 只回填非密码字段；密码一律不回填，编辑时留空表示保持不变
        const values = {};
        (backend.fields || []).forEach((field) => {
          if (field.type === 'password') {
            return;
          }
          const stored = remoteConfig[field.key];
          if (stored != null) {
            values[field.key] = stored;
          }
        });
        return { success: true, remote: { name, type: remoteConfig.type, values } };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'sync-delete-remote',
    handler: () => async ({ name } = {}) => {
      try {
        if (!name) {
          return { success: false, message: '参数不完整' };
        }
        const binary = syncService.resolveBinaryPath();
        const exec = createExec(async () => binary);
        await deleteRemote(exec, name);
        // 删除的只是连接配置；远程目标正引用它时一并清空，避免同步指向已删除的远程
        const syncConfig = syncService.getSyncConfig();
        let targetCleared = false;
        if (syncConfig.target === `${name}:`) {
          syncService.setSyncConfig({ ...syncConfig, target: '' });
          targetCleared = true;
        }
        return { success: true, targetCleared, status: syncService.getStatus() };
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
  {
    type: 'passthrough-list',
    handler: ({ sendToClient }) => async () => {
      captureClient(sendToClient);
      try {
        const entries = await passthroughService.listEntries();
        return { success: true, entries, status: syncService.getStatus().passthrough };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'passthrough-add',
    handler: () => async ({ name, dir } = {}) => {
      try {
        const result = await passthroughService.addEntry({ name, dir });
        if (!result.success) {
          return result;
        }
        // 新条目纳入监控，变更即自动对账
        refreshWatchTargets();
        return { success: true, entries: await passthroughService.listEntries() };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'passthrough-remove',
    handler: () => async ({ name, deleteRemote: deleteRemoteFlag } = {}) => {
      try {
        const result = await passthroughService.removeEntry({
          name,
          deleteRemote: Boolean(deleteRemoteFlag),
        });
        if (result.success) {
          refreshWatchTargets();
        }
        return result;
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'passthrough-open-dir',
    handler: () => async ({ name } = {}) => {
      try {
        const entries = await passthroughService.listEntries();
        const entry = (entries || []).find((item) => item.name === name);
        if (!entry) {
          return { success: false, message: '未找到该直通条目' };
        }
        if (!entry.localExists) {
          return { success: false, message: '本地目录不存在' };
        }
        const error = await shell.openPath(entry.dir);
        return error ? { success: false, message: error } : { success: true };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    // 直通详情弹窗的路径面板：枚举本地目录内的具体文件（与备份弹窗的存档路径面板同构）
    type: 'passthrough-list-files',
    handler: () => async ({ name } = {}) => {
      try {
        const entries = await passthroughService.listEntries();
        const entry = (entries || []).find((item) => item.name === name);
        if (!entry) {
          return { success: false, message: '未找到该直通条目' };
        }
        if (!(await pathExists(entry.dir))) {
          return { success: true, sources: [], empty: true };
        }
        const { files } = await listDirFiles(entry.dir);
        if (files.length === 0) {
          return { success: true, sources: [], empty: true };
        }
        return {
          success: true,
          sources: [createCustomDirectorySource({
            id: `passthrough:${normalizeCustomDir(entry.dir)}`,
            absolutePath: entry.dir,
            relativePath: '.',
            files,
            enabled: true,
            label: '直通目录',
          })],
        };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'passthrough-restore',
    handler: () => async ({ name } = {}) => {
      try {
        const result = await passthroughService.restoreEntry({ name });
        if (result.success) {
          // 本地目录由无到有，重建监控集使后续变更自动同步
          refreshWatchTargets();
        }
        return result;
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  },
  {
    type: 'passthrough-resolve',
    handler: () => async ({ entryId, mode } = {}) => {
      try {
        const result = await passthroughService.resolveConflict({ entryId, mode });
        if (!result.success) {
          return result;
        }
        return { success: true, status: syncService.getStatus() };
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
