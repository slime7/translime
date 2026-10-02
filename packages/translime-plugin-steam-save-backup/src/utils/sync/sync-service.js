import { randomUUID } from 'node:crypto';
import { runSync, SyncCancelledError } from './engine';
import { createExec, probeRclone } from './rclone';
import createSyncQueue from './queue';

const emptyProbe = () => ({
  ok: null, version: null, path: null, error: null,
});

/**
 * 同步功能编排层：配置读写、持久状态（machineId / 脏游戏 / 上次报告）、
 * rclone 探测与串行队列的组合。远程端是单一可靠源（docs/auto-sync-research.md §4）。
 *
 * @param {object} options
 * @param {string} options.pluginId 插件 ID
 * @param {(key: string, defaultValue?: any) => any} options.getConfig 读取宿主配置
 * @param {(key: string, value: any) => void} options.setConfig 写入宿主配置
 * @param {() => Promise<string>} options.resolveBackupRoot 解析当前备份根目录
 */
const createSyncService = ({
  pluginId, getConfig, setConfig, resolveBackupRoot,
}) => {
  const settingsKey = `plugin.${pluginId}.settings.sync`;
  const stateKey = `plugin.${pluginId}.syncState`;

  let cancelled = false;
  let exec = null;
  let activateTimer = null;
  let rcloneProbe = emptyProbe();

  const readSyncConfig = () => {
    const raw = getConfig(settingsKey);
    if (!raw || typeof raw !== 'object') {
      return { enabled: false, target: '', rclonePath: '' };
    }
    return {
      enabled: Boolean(raw.enabled),
      target: typeof raw.target === 'string' ? raw.target.trim() : '',
      rclonePath: typeof raw.rclonePath === 'string' ? raw.rclonePath.trim() : '',
    };
  };

  const readPersistedState = () => {
    const raw = getConfig(stateKey);
    if (!raw || typeof raw !== 'object') {
      return {
        machineId: null, dirtyGames: [], lastReport: null, lastError: null, lastRunAt: null,
      };
    }
    return {
      machineId: typeof raw.machineId === 'string' ? raw.machineId : null,
      dirtyGames: Array.isArray(raw.dirtyGames) ? raw.dirtyGames.map(String) : [],
      lastReport: raw.lastReport || null,
      lastError: typeof raw.lastError === 'string' ? raw.lastError : null,
      lastRunAt: typeof raw.lastRunAt === 'string' ? raw.lastRunAt : null,
    };
  };

  const writePersistedState = (partial) => {
    setConfig(stateKey, { ...readPersistedState(), ...partial });
  };

  const ensureMachineId = () => {
    const persisted = readPersistedState();
    if (persisted.machineId) {
      return persisted.machineId;
    }
    const machineId = randomUUID();
    writePersistedState({ machineId });
    return machineId;
  };

  const resolveBinary = (syncConfig) => syncConfig.rclonePath || 'rclone';

  const isConfigured = () => {
    const syncConfig = readSyncConfig();
    return syncConfig.enabled && Boolean(syncConfig.target);
  };

  const runOnce = async () => {
    const syncConfig = readSyncConfig();
    const binary = resolveBinary(syncConfig);

    try {
      rcloneProbe = await probeRclone(binary);
      if (!rcloneProbe.ok) {
        throw new Error(
          `未找到可用的 rclone（${binary}）：${rcloneProbe.error}。请安装 rclone 或在同步设置中填写可执行文件路径。`,
        );
      }
    } catch (e) {
      // 探测失败也要落到持久状态，否则“立即同步”的失败在 UI 上无痕迹
      writePersistedState({ lastError: e.message, lastRunAt: new Date().toISOString() });
      throw e;
    }
    // 探测阶段（可达 15s）收到取消：直接结束，且不得重置 cancelled 标志
    if (cancelled) {
      return;
    }

    exec = createExec(async () => rcloneProbe.path);
    cancelled = false;

    try {
      const report = await runSync({
        exec,
        target: syncConfig.target,
        backupRoot: await resolveBackupRoot(),
        machineId: ensureMachineId(),
        isCancelled: () => cancelled,
      });
      writePersistedState({
        lastReport: report,
        lastError: null,
        lastRunAt: report.finishedAt,
        dirtyGames: [],
      });
    } catch (e) {
      if (e instanceof SyncCancelledError) {
        // 用户主动取消不算失败，不触发重试
        return;
      }
      writePersistedState({ lastError: e.message, lastRunAt: new Date().toISOString() });
      throw e;
    } finally {
      exec = null;
    }
  };

  const queue = createSyncQueue({
    run: runOnce,
    canRun: isConfigured,
  });

  const resolvePhase = (queueState) => {
    if (queueState.running) {
      return 'running';
    }
    return queueState.retryScheduled ? 'retry-wait' : 'idle';
  };

  const getStatus = () => {
    const persisted = readPersistedState();
    const queueState = queue.getState();
    return {
      phase: resolvePhase(queueState),
      pending: queueState.pending,
      config: readSyncConfig(),
      rclone: rcloneProbe,
      dirtyGames: persisted.dirtyGames,
      lastReport: persisted.lastReport,
      lastError: persisted.lastError,
      lastRunAt: persisted.lastRunAt,
    };
  };

  return {
    getSyncConfig: readSyncConfig,

    resolveBinaryPath() {
      return resolveBinary(readSyncConfig());
    },

    setSyncConfig({ enabled, target, rclonePath }) {
      setConfig(settingsKey, {
        enabled: Boolean(enabled),
        target: typeof target === 'string' ? target.trim() : '',
        rclonePath: typeof rclonePath === 'string' ? rclonePath.trim() : '',
      });
      if (!enabled) {
        queue.clearRetry();
      }
      return getStatus();
    },

    getStatus,

    async checkRclone(rclonePath) {
      const syncConfig = readSyncConfig();
      const binary = (typeof rclonePath === 'string' && rclonePath.trim())
        || syncConfig.rclonePath
        || 'rclone';
      rcloneProbe = await probeRclone(binary);
      return rcloneProbe;
    },

    trigger(reason = 'auto') {
      return queue.trigger(reason);
    },

    onBackupCreated(gameId) {
      const persisted = readPersistedState();
      const id = String(gameId);
      if (!persisted.dirtyGames.includes(id)) {
        writePersistedState({ dirtyGames: [...persisted.dirtyGames, id] });
      }
      queue.trigger('backup');
    },

    // 激活后延迟对账，避免阻塞 pluginDidLoad
    onActivated() {
      if (!isConfigured()) {
        return;
      }
      if (activateTimer) {
        clearTimeout(activateTimer);
      }
      activateTimer = setTimeout(() => {
        activateTimer = null;
        queue.trigger('activate');
      }, 5000);
    },

    cancel() {
      cancelled = true;
      queue.clearRetry();
      if (exec) {
        exec.killAll();
      }
    },

    dispose() {
      this.cancel();
      if (activateTimer) {
        clearTimeout(activateTimer);
        activateTimer = null;
      }
    },

    ensureMachineId,
  };
};

export default createSyncService;
