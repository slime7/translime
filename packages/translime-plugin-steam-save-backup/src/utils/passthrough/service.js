import { randomUUID } from 'node:crypto';
import { pathExists, stat } from '../fs-wrapper';
import { normalizeCustomDir, normalizeGameNameKey } from '../custom-dirs';
import { createExec } from '../sync/rclone';
import { SyncCancelledError } from '../sync/engine';
import { buildEntryId } from './meta';
import {
  deletePassthroughRemote,
  resolvePassthroughConflict,
  restorePassthroughEntry,
  runPassthroughSync,
} from './engine';

const NOTIFICATION_LIMIT = 50;

/**
 * 直通云存档编排层：条目配置管理、持久状态维护与 rclone 操作。
 *
 * @param {object} options
 * @param {string} options.pluginId 插件 ID
 * @param {(key: string, defaultValue?: any) => any} options.getConfig 读取宿主配置
 * @param {(key: string, value: any) => void} options.setConfig 写入宿主配置
 * @param {() => string} options.getMachineId 本机标识
 * @param {() => string} options.resolveBinary rclone 可执行文件路径
 * @param {(payload: object) => void} [options.onNotify] 后台事件通知
 */
const createPassthroughService = ({
  pluginId,
  getConfig,
  setConfig,
  getMachineId,
  resolveBinary,
  onNotify = () => {},
}) => {
  const settingsKey = `plugin.${pluginId}.settings.passthroughDirs`;
  const stateKey = `plugin.${pluginId}.passthroughState`;

  const readEntries = () => {
    const raw = getConfig(settingsKey, []);
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .filter((entry) => entry && typeof entry.name === 'string' && entry.name.trim()
        && typeof entry.dir === 'string' && entry.dir)
      .map((entry) => ({ name: entry.name.trim(), dir: entry.dir }));
  };

  const saveEntries = (list) => {
    setConfig(settingsKey, list);
  };

  const readState = () => {
    const raw = getConfig(stateKey, {});
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {
        conflicts: [], notifications: [], lastReport: null, lastError: null, watermarks: {}, manifests: {},
      };
    }
    return {
      conflicts: Array.isArray(raw.conflicts) ? raw.conflicts : [],
      notifications: Array.isArray(raw.notifications) ? raw.notifications : [],
      lastReport: raw.lastReport || null,
      lastError: typeof raw.lastError === 'string' ? raw.lastError : null,
      // 各条目上次完成同步的水位（entryId → ISO 时间）
      watermarks: raw.watermarks && typeof raw.watermarks === 'object' && !Array.isArray(raw.watermarks)
        ? raw.watermarks
        : {},
      // 各条目上次同步的文件清单（entryId → relPath → mtimeMs:size）
      manifests: raw.manifests && typeof raw.manifests === 'object' && !Array.isArray(raw.manifests)
        ? raw.manifests
        : {},
    };
  };

  const writeState = (partial) => {
    setConfig(stateKey, { ...readState(), ...partial });
  };

  const findEntry = (name) => {
    const key = normalizeGameNameKey(name);
    return readEntries().find((entry) => normalizeGameNameKey(entry.name) === key) || null;
  };

  const getTarget = () => {
    const raw = getConfig(`plugin.${pluginId}.settings.sync`, {});
    return raw && typeof raw === 'object' && typeof raw.target === 'string'
      ? raw.target.trim()
      : '';
  };

  const prepareExec = () => createExec(async () => resolveBinary());

  return {
    /** 条目配置（供监控集构建，含目录路径） */
    getConfiguredEntries: readEntries,

    getTarget,

    isRemoteAvailable: () => Boolean(getTarget()),

    listEntries: async () => {
      const entries = readEntries();
      return Promise.all(entries.map(async (entry) => ({
        entryId: buildEntryId(entry.name),
        name: entry.name,
        dir: entry.dir,
        localExists: await pathExists(entry.dir),
      })));
    },

    /** 添加直通条目（允许登记空目录） */
    addEntry: async ({ name, dir }) => {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      const trimmedDir = typeof dir === 'string' ? dir.trim() : '';
      if (!trimmedName) {
        return { success: false, message: '请填写存档名称' };
      }
      if (!trimmedDir) {
        return { success: false, message: '请选择存档目录' };
      }
      let stats = null;
      try {
        stats = await stat(trimmedDir);
      } catch {
        stats = null;
      }
      if (!stats || !stats.isDirectory()) {
        return { success: false, message: '目录不存在或不可访问' };
      }

      const list = readEntries();
      const nameKey = normalizeGameNameKey(trimmedName);
      if (list.some((entry) => normalizeGameNameKey(entry.name) === nameKey)) {
        return { success: false, message: '同名存档条目已存在' };
      }
      const dirKey = normalizeCustomDir(trimmedDir);
      if (list.some((entry) => normalizeCustomDir(entry.dir) === dirKey)) {
        return { success: false, message: '该目录已被其他条目使用' };
      }

      list.push({ name: trimmedName, dir: trimmedDir });
      saveEntries(list);
      return { success: true };
    },

    /**
     * 取消链接：解除本地条目绑定；勾选 deleteRemote 时同步清理远端并写入删除墓碑。
     */
    removeEntry: async ({ name, deleteRemote }) => {
      const entry = findEntry(typeof name === 'string' ? name : '');
      if (!entry) {
        return { success: false, message: '未找到该直通条目' };
      }
      const entryId = buildEntryId(entry.name);

      let remoteDeleted = false;
      const target = getTarget();
      if (deleteRemote && target) {
        const exec = prepareExec();
        try {
          await deletePassthroughRemote(exec, target, {
            entryId,
            name: entry.name,
            machineId: getMachineId(),
            tombstoneAt: new Date().toISOString(),
          });
          remoteDeleted = true;
        } catch (e) {
          // 远程删除失败时保留本地绑定以便重试
          return { success: false, message: `远程删除失败，已保留链接可重试：${e.message}` };
        } finally {
          exec.killAll();
        }
      }

      const list = readEntries();
      const next = list.filter((item) => normalizeGameNameKey(item.name) !== normalizeGameNameKey(entry.name));
      saveEntries(next);
      const manifests = { ...readState().manifests };
      delete manifests[entryId];
      writeState({
        conflicts: readState().conflicts.filter((item) => item.entryId !== entryId),
        manifests,
      });
      return { success: true, remoteDeleted };
    },

    /** 本地目录缺失时恢复下载 */
    restoreEntry: async ({ name }) => {
      const entry = findEntry(name);
      if (!entry) {
        return { success: false, message: '未找到该直通条目' };
      }
      const target = getTarget();
      if (!target) {
        return { success: false, message: '请先在同步设置中配置远程目标' };
      }
      const exec = prepareExec();
      try {
        const result = await restorePassthroughEntry(exec, target, {
          entryId: buildEntryId(entry.name),
          dir: entry.dir,
        });
        // 恢复完成后记录水位与本地清单
        if (result.updatedAt) {
          writeState({
            watermarks: { ...readState().watermarks, [buildEntryId(entry.name)]: result.updatedAt },
            manifests: { ...readState().manifests, [buildEntryId(entry.name)]: result.manifest },
          });
        }
        return { success: true };
      } finally {
        exec.killAll();
      }
    },

    /** 直通冲突处置：keep-local 保留本地 / confirm-deletion 确认删除本地 / use-remote 采用远端 */
    resolveConflict: async ({ entryId, mode }) => {
      if (!entryId || !mode) {
        return { success: false, message: '参数不完整' };
      }
      const state = readState();
      const known = state.conflicts.find((item) => item.entryId === entryId);
      if (!known) {
        return { success: false, message: '冲突不存在或已处理' };
      }
      const entry = readEntries().find((item) => buildEntryId(item.name) === entryId);
      if (!entry) {
        return { success: false, message: '未找到该直通条目' };
      }
      const target = getTarget();
      if (!target) {
        return { success: false, message: '请先在同步设置中配置远程目标' };
      }

      const exec = prepareExec();
      let resolution;
      try {
        resolution = await resolvePassthroughConflict(exec, target, {
          entryId,
          name: entry.name,
          dir: entry.dir,
          mode,
          machineId: getMachineId(),
        });
      } finally {
        exec.killAll();
      }

      // 更新对应条目的水位与本地清单
      if (resolution.updatedAt) {
        writeState({
          watermarks: { ...readState().watermarks, [entryId]: resolution.updatedAt },
          manifests: { ...readState().manifests, [entryId]: resolution.manifest },
        });
      } else if (mode === 'confirm-deletion') {
        const manifests = { ...readState().manifests };
        delete manifests[entryId];
        writeState({ manifests });
      }
      writeState({
        conflicts: state.conflicts.filter((item) => item.entryId !== entryId),
      });
      return { success: true };
    },

    /**
     * 执行直通对账
     */
    runSync: async ({ exec, target, isCancelled = () => false }) => {
      const entries = readEntries().map((entry) => ({
        entryId: buildEntryId(entry.name),
        name: entry.name,
        dir: entry.dir,
      }));
      if (entries.length === 0) {
        return null;
      }
      try {
        const state = readState();
        const report = await runPassthroughSync({
          exec,
          target,
          entries,
          machineId: getMachineId(),
          watermarks: state.watermarks,
          manifests: state.manifests,
          isCancelled,
        });
        const notifications = report.appliedDeletions.map((item) => ({
          id: randomUUID(),
          kind: 'passthrough-deleted',
          name: item.name,
          at: report.finishedAt,
        }));
        notifications.forEach(onNotify);
        // 保存本轮更新的水位与本地清单，移除已删除条目的清单
        const manifests = { ...state.manifests, ...(report.manifests || {}) };
        report.appliedDeletions.forEach((item) => {
          delete manifests[item.entryId];
        });
        writeState({
          lastReport: report,
          lastError: null,
          conflicts: report.conflicts,
          watermarks: { ...state.watermarks, ...(report.watermarks || {}) },
          manifests,
          notifications: [...notifications, ...state.notifications].slice(0, NOTIFICATION_LIMIT),
        });
        return report;
      } catch (e) {
        if (e instanceof SyncCancelledError) {
          throw e;
        }
        writeState({ lastError: e.message });
        return null;
      }
    },

    getStatus: () => ({
      ...readState(),
      entryCount: readEntries().length,
    }),
  };
};

export default createPassthroughService;
