import { ref } from 'vue';
import { useIpc } from 'translime-sdk';

const PLUGIN_ID = 'translime-plugin-steam-save-backup';

// 模块级单例：多个组件共享同一份状态与轮询，避免重复请求
const status = ref(null);
let ipcInstance = null;
let pollTimer = null;
let retryTimer = null;

const getIpc = () => {
  if (!ipcInstance) {
    ipcInstance = useIpc();
  }
  return ipcInstance;
};

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

export const syncStatus = status;

// 只拉取一次状态，不管理轮询；返回是否成功
const fetchStatus = async () => {
  try {
    const res = await getIpc().invoke(`sync-get-status@${PLUGIN_ID}`);
    if (res?.success) {
      status.value = res.status;
      return true;
    }
  } catch {
    // 失败时保留上次状态
  }
  return false;
};

// 运行期间轮询刷新；转空闲后自动停止
const ensurePolling = () => {
  if (pollTimer) {
    return;
  }
  pollTimer = setInterval(async () => {
    await fetchStatus();
    if (status.value?.phase !== 'running') {
      stopPolling();
    }
  }, 1500);
};

export async function refreshSyncStatus() {
  const ok = await fetchStatus();
  // 初始加载失败（如插件正在被 watcher 重启）：有限重试，避免同步状态永久为空
  if (!ok && status.value === null && !retryTimer) {
    retryTimer = setTimeout(() => {
      retryTimer = null;
      refreshSyncStatus();
    }, 3000);
  }
  if (status.value?.phase === 'running') {
    ensurePolling();
  }
  return status.value;
}

export const triggerSyncNow = async () => {
  const res = await getIpc().invoke(`sync-now@${PLUGIN_ID}`);
  await refreshSyncStatus();
  return res;
};

export const cancelSync = async () => {
  const res = await getIpc().invoke(`sync-cancel@${PLUGIN_ID}`);
  await refreshSyncStatus();
  return res;
};

export const setSyncConfig = async (syncConfig) => {
  const res = await getIpc().invoke(`sync-set-config@${PLUGIN_ID}`, syncConfig);
  if (res?.success) {
    status.value = res.status;
    if (status.value?.phase === 'running') {
      ensurePolling();
    }
  }
  return res;
};

export const checkRclone = async (rclonePath) => getIpc().invoke(`sync-check-rclone@${PLUGIN_ID}`, { rclonePath });

export const resolveSyncConflict = async ({ gameId, dir, mode }) => {
  const res = await getIpc().invoke(`sync-resolve-conflict@${PLUGIN_ID}`, { gameId, dir, mode });
  if (res?.success) {
    status.value = res.status;
    if (status.value?.phase === 'running') {
      ensurePolling();
    }
  }
  return res;
};

export const stopSyncStatusPolling = () => {
  stopPolling();
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
};

/**
 * 每游戏的同步状态：同步冲突 / 同步中 / 待上传 / 已同步。
 */
export const gameSyncState = (gameId) => {
  const current = status.value;
  if (!current?.config?.target) {
    return null;
  }
  const id = String(gameId);
  if (current.conflicts?.some((item) => String(item.gameId) === id)) {
    return { key: 'conflict', label: '同步冲突', icon: 'sync_problem' };
  }
  if (current.phase === 'running') {
    return { key: 'syncing', label: '同步中', icon: 'sync' };
  }
  if (current.dirtyGames?.includes(id)) {
    return { key: 'pending', label: '待上传', icon: 'cloud_upload' };
  }
  const game = current.lastReport?.perGame?.[id];
  if (!game) {
    return null;
  }
  const parts = [];
  if (game.uploads) {
    parts.push(`上传 ${game.uploads}`);
  }
  if (game.downloads) {
    parts.push(`下载 ${game.downloads}`);
  }
  if (game.renames) {
    parts.push(`冲突保留 ${game.renames}`);
  }
  return {
    key: 'synced',
    label: '已同步',
    icon: 'cloud_done',
    detail: parts.length > 0 ? `上次同步：${parts.join(' · ')}` : '上次同步：无变化',
  };
};

export default function useSyncStatus() {
  return {
    status,
    refresh: refreshSyncStatus,
    triggerNow: triggerSyncNow,
    cancel: cancelSync,
  };
}
