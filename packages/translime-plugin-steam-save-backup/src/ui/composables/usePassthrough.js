import {
  computed,
  ref,
} from 'vue';
import { useIpc } from 'translime-sdk';
import { syncStatus } from './useSyncStatus';

const PLUGIN_ID = 'translime-plugin-steam-save-backup';

/**
 * 直通云存档视图状态：条目列表、删除冲突与最近对账结果。
 * 同步状态复用 useSyncStatus 的单例（passthrough 段挂在 sync-get-status 载荷内）。
 */
export default function usePassthrough() {
  const ipc = useIpc();

  const entries = ref([]);
  const loading = ref({
    list: false,
    add: false,
    remove: null, // 条目名
    restore: null, // 条目名
    resolve: null, // entryId
  });

  const configured = computed(() => Boolean(syncStatus.value?.config?.target));
  const syncing = computed(() => syncStatus.value?.phase === 'running');
  const state = computed(() => syncStatus.value?.passthrough || null);
  const conflicts = computed(() => state.value?.conflicts || []);
  const lastReport = computed(() => state.value?.lastReport || null);
  const lastError = computed(() => state.value?.lastError || null);
  const notifications = computed(() => state.value?.notifications || []);

  // 只读探测结果：entryId → { action, remoteUpdatedAt, remoteDeletedAt }
  const probeEntries = ref({});
  const probeLoading = ref(false);

  // 同步进行中结果马上会被对账刷新，跳过探测避免读到中间态
  const probe = async () => {
    if (syncing.value || probeLoading.value) {
      return;
    }
    probeLoading.value = true;
    try {
      const res = await ipc.invoke(`passthrough-probe@${PLUGIN_ID}`);
      if (res.success) {
        probeEntries.value = Object.fromEntries(
          (res.entries || []).map((item) => [item.entryId, item]),
        );
      }
    } finally {
      probeLoading.value = false;
    }
  };

  // 计算条目展示状态：已登记冲突优先（可处置），其余取探测得到的待同步状态
  const entryStatus = (entry) => {
    const conflict = conflicts.value.find((item) => item.entryId === entry.entryId);
    if (conflict) {
      return conflict.kind === 'content'
        ? { key: 'conflict', label: '同步冲突', icon: 'sync_problem' }
        : { key: 'conflict', label: '删除冲突', icon: 'sync_problem' };
    }
    if (!entry.localExists) {
      return { key: 'missing', label: '本地缺失', icon: 'cloud_off' };
    }
    if (syncing.value) {
      return { key: 'syncing', label: '同步中', icon: 'sync' };
    }
    const probeData = probeEntries.value[entry.entryId];
    switch (probeData?.action) {
    case 'content-conflict':
      return {
        key: 'conflict',
        label: '同步冲突',
        icon: 'sync_problem',
        detail: '本机与远端都有更新，需选择保留哪一边',
      };
    case 'deletion-conflict':
      return {
        key: 'conflict',
        label: '删除冲突',
        icon: 'sync_problem',
        detail: '远端存档已删除，但本机在其后仍有更新，需确认保留哪一边',
      };
    case 'sync-download':
      return {
        key: 'remote-update',
        label: '云端更新',
        icon: 'cloud_download',
        detail: '远端存档有新版本，立即同步后下载到本机',
        remoteUpdatedAt: probeData.remoteUpdatedAt || null,
      };
    case 'sync-upload':
      return {
        key: 'pending-upload',
        label: '待上传',
        icon: 'cloud_upload',
        detail: '本机存档有变更，立即同步后上传覆盖远端',
      };
    case 'apply-deletion':
      return {
        key: 'remote-deleted',
        label: '云端已删除',
        icon: 'cloud_off',
        detail: '远端存档已被删除，下次同步将移除本机目录',
      };
    case 'noop':
      return {
        key: 'synced',
        label: '已同步',
        icon: 'cloud_done',
        detail: '本机与远端存档一致',
      };
    default:
      // 探测不可用（未完成或失败）时的兜底展示
      return { key: 'ready', label: '直通已启用', icon: 'cloud_done' };
    }
  };

  const load = async () => {
    loading.value.list = true;
    try {
      const res = await ipc.invoke(`passthrough-list@${PLUGIN_ID}`);
      if (res.success) {
        entries.value = res.entries || [];
      }
      return res;
    } finally {
      loading.value.list = false;
    }
  };

  const addEntry = async ({ name, dir }) => {
    loading.value.add = true;
    try {
      const res = await ipc.invoke(`passthrough-add@${PLUGIN_ID}`, { name, dir });
      if (res.success) {
        entries.value = res.entries || [];
      }
      return res;
    } finally {
      loading.value.add = false;
    }
  };

  const removeEntry = async (name, deleteRemote) => {
    loading.value.remove = name;
    try {
      const res = await ipc.invoke(`passthrough-remove@${PLUGIN_ID}`, {
        name,
        deleteRemote: Boolean(deleteRemote),
      });
      if (res.success) {
        await load();
      }
      return res;
    } finally {
      loading.value.remove = null;
    }
  };

  const openDir = async (name) => {
    const res = await ipc.invoke(`passthrough-open-dir@${PLUGIN_ID}`, { name });
    return res;
  };

  // 列举本地存档文件
  const listFiles = async (name) => {
    const res = await ipc.invoke(`passthrough-list-files@${PLUGIN_ID}`, { name });
    return res;
  };

  const restoreEntry = async (name) => {
    loading.value.restore = name;
    try {
      const res = await ipc.invoke(`passthrough-restore@${PLUGIN_ID}`, { name });
      if (res.success) {
        await load();
      }
      return res;
    } finally {
      loading.value.restore = null;
    }
  };

  const resolveConflict = async ({ entryId, mode }) => {
    loading.value.resolve = entryId;
    try {
      const res = await ipc.invoke(`passthrough-resolve@${PLUGIN_ID}`, { entryId, mode });
      return res;
    } finally {
      loading.value.resolve = null;
    }
  };

  return {
    entries,
    loading,
    configured,
    syncing,
    conflicts,
    lastReport,
    lastError,
    notifications,
    probeEntries,
    probeLoading,
    entryStatus,
    probe,
    load,
    addEntry,
    removeEntry,
    openDir,
    listFiles,
    restoreEntry,
    resolveConflict,
  };
}
