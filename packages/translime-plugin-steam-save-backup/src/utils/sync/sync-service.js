import { randomUUID } from 'node:crypto';
import {
  deleteRemoteBackup as deleteRemoteBackupOp, resolveConflict, runSync, SyncCancelledError,
} from './engine';
import { createExec, probeRclone } from './rclone';
import createSyncQueue from './queue';

const emptyProbe = () => ({
  ok: null, version: null, path: null, error: null,
});

/**
 * 同步功能编排层：配置管理、持久状态维护、rclone 探测与串行队列调度。
 * 同步仅由用户手动触发，或在处理冲突后自动补跑对账。
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
  let rcloneProbe = emptyProbe();

  const readSyncConfig = () => {
    const raw = getConfig(settingsKey);
    if (!raw || typeof raw !== 'object') {
      return { target: '', rclonePath: '' };
    }
    return {
      target: typeof raw.target === 'string' ? raw.target.trim() : '',
      rclonePath: typeof raw.rclonePath === 'string' ? raw.rclonePath.trim() : '',
    };
  };

  const readPersistedState = () => {
    const raw = getConfig(stateKey);
    if (!raw || typeof raw !== 'object') {
      return {
        machineId: null, dirtyGames: [], conflicts: [], lastReport: null, lastError: null, lastRunAt: null,
      };
    }
    return {
      machineId: typeof raw.machineId === 'string' ? raw.machineId : null,
      dirtyGames: Array.isArray(raw.dirtyGames) ? raw.dirtyGames.map(String) : [],
      conflicts: Array.isArray(raw.conflicts) ? raw.conflicts : [],
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

  const isConfigured = () => Boolean(readSyncConfig().target);

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
        isCancelled: () => cancelled,
      });
      writePersistedState({
        lastReport: report,
        lastError: null,
        lastRunAt: report.finishedAt,
        dirtyGames: [],
        // 冲突清单以最近一次对账为准；用户处理过的条目会在处理成功后即时移除
        conflicts: report.conflicts || [],
      });
    } catch (e) {
      if (e instanceof SyncCancelledError) {
        // 用户主动取消不算失败
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

  const getStatus = () => {
    const persisted = readPersistedState();
    const queueState = queue.getState();
    return {
      phase: queueState.running ? 'running' : 'idle',
      pending: queueState.pending,
      config: readSyncConfig(),
      rclone: rcloneProbe,
      dirtyGames: persisted.dirtyGames,
      conflicts: persisted.conflicts,
      lastReport: persisted.lastReport,
      lastError: persisted.lastError,
      lastRunAt: persisted.lastRunAt,
    };
  };

  const prepareExec = async () => {
    const syncConfig = readSyncConfig();
    const binary = resolveBinary(syncConfig);
    rcloneProbe = await probeRclone(binary);
    if (!rcloneProbe.ok) {
      throw new Error(
        `未找到可用的 rclone（${binary}）：${rcloneProbe.error}。请安装 rclone 或在同步设置中填写可执行文件路径。`,
      );
    }
    return createExec(async () => rcloneProbe.path);
  };

  /**
   * 删除远端的一份备份（“同时删除远程存档”）。
   * 远端目录名是 gameId + 时间戳，语义不直观，因此由本地删除动作携带执行，
   * 并联动清理同一目录的未处理冲突条目（两端都已删除，冲突自然消解）。
   */
  const removeRemoteBackup = async ({ gameId, dir }) => {
    const syncConfig = readSyncConfig();
    if (!syncConfig.target) {
      throw new Error('未配置远程目标');
    }
    cancelled = false;
    const backupExec = await prepareExec();
    try {
      await deleteRemoteBackupOp(backupExec, syncConfig.target, String(gameId), dir);
    } finally {
      backupExec.killAll();
    }

    writePersistedState({
      conflicts: readPersistedState().conflicts.filter(
        (item) => !(String(item.gameId) === String(gameId) && item.dir === dir),
      ),
    });
    return getStatus();
  };

  /**
   * 处理单个同步冲突（Steam Cloud 式三选一）。
   * 成功后立即从持久状态移除该冲突，并触发一次对账确认两端一致。
   */
  const resolveOneConflict = async ({ gameId, dir, mode }) => {
    const syncConfig = readSyncConfig();
    if (!syncConfig.target) {
      throw new Error('未配置远程目标');
    }
    const known = readPersistedState().conflicts.find(
      (item) => String(item.gameId) === String(gameId) && item.dir === dir,
    );
    if (!known) {
      throw new Error('冲突不存在或已处理');
    }

    cancelled = false;
    const conflictExec = await prepareExec();
    try {
      await resolveConflict({
        exec: conflictExec,
        target: syncConfig.target,
        backupRoot: await resolveBackupRoot(),
        gameId,
        dir,
        mode,
        remoteKind: known.remoteKind === 'dir' ? 'dir' : 'zip',
        machineId: ensureMachineId(),
        isCancelled: () => cancelled,
      });
    } finally {
      conflictExec.killAll();
    }

    writePersistedState({
      conflicts: readPersistedState().conflicts.filter(
        (item) => !(String(item.gameId) === String(gameId) && item.dir === dir),
      ),
    });
    queue.trigger();
    return getStatus();
  };

  return {
    getSyncConfig: readSyncConfig,

    resolveBinaryPath() {
      return resolveBinary(readSyncConfig());
    },

    setSyncConfig({ target, rclonePath }) {
      setConfig(settingsKey, {
        target: typeof target === 'string' ? target.trim() : '',
        rclonePath: typeof rclonePath === 'string' ? rclonePath.trim() : '',
      });
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

    trigger() {
      return queue.trigger();
    },

    removeRemoteBackup,

    isRemoteDeletionAvailable() {
      return isConfigured();
    },

    resolveOneConflict,

    // 备份后仅记录待上传状态（驱动游戏卡片的“待上传”提示），同步等用户手动触发
    markDirty(gameId) {
      const persisted = readPersistedState();
      const id = String(gameId);
      if (!persisted.dirtyGames.includes(id)) {
        writePersistedState({ dirtyGames: [...persisted.dirtyGames, id] });
      }
    },

    cancel() {
      cancelled = true;
      if (exec) {
        exec.killAll();
      }
    },

    dispose() {
      this.cancel();
    },

    ensureMachineId,
  };
};

export default createSyncService;
