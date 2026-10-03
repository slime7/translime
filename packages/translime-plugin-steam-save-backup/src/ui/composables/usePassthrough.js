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

  // 条目状态：删除冲突 > 本地缺失 > 同步中 > 已接入
  const entryStatus = (entry) => {
    if (conflicts.value.some((item) => item.entryId === entry.entryId)) {
      return { key: 'conflict', label: '删除冲突', icon: 'sync_problem' };
    }
    if (!entry.localExists) {
      return { key: 'missing', label: '本地缺失', icon: 'cloud_off' };
    }
    if (syncing.value) {
      return { key: 'syncing', label: '同步中', icon: 'sync' };
    }
    return { key: 'ready', label: '直通已启用', icon: 'cloud_done' };
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

  // 直通详情弹窗的路径面板数据：枚举本地目录内的具体文件
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
    entryStatus,
    load,
    addEntry,
    removeEntry,
    openDir,
    listFiles,
    restoreEntry,
    resolveConflict,
  };
}
