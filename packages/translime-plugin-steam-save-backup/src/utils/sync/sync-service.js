import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildTombstoneInfo } from './manifest';
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
 * 同步由用户手动触发、文件监控自动触发，或在处理冲突后自动补跑对账。
 * 可选注入 passthrough（直通云存档服务）：每次对账末尾附带直通条目对账。
 *
 * @param {object} options
 * @param {string} options.pluginId 插件 ID
 * @param {(key: string, defaultValue?: any) => any} options.getConfig 读取宿主配置
 * @param {(key: string, value: any) => void} options.setConfig 写入宿主配置
 * @param {() => Promise<string>} options.resolveBackupRoot 解析当前备份根目录
 * @param {{ runSync: (args: object) => Promise<object|null>, getStatus: () => object }} [options.passthrough] 直通云存档服务
 * @param {(payload: object) => void} [options.onEvent] 后台事件通知（远端删除跟随、直通事件）
 */
const createSyncService = ({
  pluginId, getConfig, setConfig, resolveBackupRoot, passthrough = null, onEvent = () => {},
}) => {
  // 直通服务在入口处组合（其 machineId 依赖本服务），经 setter 回接，避免循环构造
  let passthroughService = passthrough;
  const settingsKey = `plugin.${pluginId}.settings.sync`;
  const stateKey = `plugin.${pluginId}.syncState`;

  let cancelled = false;
  let exec = null;
  let rcloneProbe = emptyProbe();

  const readSyncConfig = () => {
    const raw = getConfig(settingsKey);
    const topSettings = getConfig(`plugin.${pluginId}.settings`);
    let topRclonePath = '';
    if (topSettings && typeof topSettings === 'object') {
      const val = topSettings.rclonePath;
      if (Array.isArray(val)) {
        topRclonePath = val[0] || '';
      } else if (typeof val === 'string') {
        topRclonePath = val.trim();
      }
    }
    const syncRclone = raw && typeof raw === 'object' && typeof raw.rclonePath === 'string'
      ? raw.rclonePath.trim()
      : '';
    const target = raw && typeof raw === 'object' && typeof raw.target === 'string'
      ? raw.target.trim()
      : '';
    return {
      target,
      rclonePath: syncRclone || topRclonePath,
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
      // 远端删除已跟随应用到本地：推送通知（UI 未打开时仅落状态）
      (report.deletions || []).forEach((item) => {
        onEvent({
          kind: 'backup-deleted',
          gameId: item.gameId,
          dir: item.dir,
          gameName: item.gameName || '',
        });
      });

      // 直通条目对账：与备份对账共用连接与队列槽位；
      // 失败由直通服务记录到自身状态，不影响备份对账结果；取消向上抛给统一处理
      if (passthroughService) {
        await passthroughService.runSync({
          exec,
          target: syncConfig.target,
          isCancelled: () => cancelled,
        });
      }
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
      passthrough: passthroughService ? passthroughService.getStatus() : null,
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
   * 远端目录名是 gameId + 时间戳，语义不直观，因此由本地删除动作携带执行；
   * 远端保留带删除标记的 info.json（墓碑），其他端对账时跟随删除、不再回补或重新上传。
   * info 为本地删除前读取的原备份元数据，用于保留远端墓碑的可读信息。
   */
  const removeRemoteBackup = async ({ gameId, dir, info = null }) => {
    const syncConfig = readSyncConfig();
    if (!syncConfig.target) {
      throw new Error('未配置远程目标');
    }
    cancelled = false;
    const backupExec = await prepareExec();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'translime-tomb-'));
    try {
      await deleteRemoteBackupOp(backupExec, syncConfig.target, String(gameId), dir, {
        tombstoneInfo: buildTombstoneInfo(info, {
          machineId: ensureMachineId(),
          at: new Date().toISOString(),
        }),
        tempDir,
      });
    } finally {
      backupExec.killAll();
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    writePersistedState({
      conflicts: readPersistedState().conflicts.filter(
        (item) => !(String(item.gameId) === String(gameId) && item.dir === dir),
      ),
    });
    return getStatus();
  };

  /**
   * 处理单个同步冲突（Steam Cloud 式三选一；墓碑冲突为两选一）。
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

    // 墓碑冲突（远端已删除、本地在删除后有更新）：
    // - overwrite-remote：恢复本备份并重建远端（本地 info.json 覆盖墓碑，撤销删除）
    // - confirm-deletion：确认远端删除，仅移除本地备份目录（远端墓碑保持）
    if (known.kind === 'tombstone') {
      if (mode !== 'overwrite-remote' && mode !== 'confirm-deletion') {
        throw new Error('远端已删除的备份仅支持「恢复本备份」或「确认删除」');
      }
      cancelled = false;
      if (mode === 'confirm-deletion') {
        const backupRoot = await resolveBackupRoot();
        await fs.rm(path.join(backupRoot, String(gameId), dir), {
          recursive: true, force: true,
        });
        writePersistedState({
          conflicts: readPersistedState().conflicts.filter(
            (item) => !(String(item.gameId) === String(gameId) && item.dir === dir),
          ),
        });
        queue.trigger();
        return getStatus();
      }
    } else if (mode === 'confirm-deletion') {
      throw new Error('该处理方式仅适用于远端删除冲突');
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

    /** 注入直通云存档服务（入口处在两个服务都构造完成后回接） */
    setPassthrough(service) {
      passthroughService = service;
    },

    resolveBinaryPath() {
      return resolveBinary(readSyncConfig());
    },

    setSyncConfig({ target, rclonePath } = {}) {
      const current = readSyncConfig();
      const nextTarget = typeof target === 'string'
        ? target.trim()
        : current.target;
      const nextRclonePath = typeof rclonePath === 'string'
        ? rclonePath.trim()
        : current.rclonePath;
      setConfig(settingsKey, {
        target: nextTarget,
        rclonePath: nextRclonePath,
      });
      setConfig(`plugin.${pluginId}.settings.rclonePath`, nextRclonePath);
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
