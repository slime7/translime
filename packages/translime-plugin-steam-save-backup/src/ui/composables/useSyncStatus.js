import { ref } from 'vue';
import { useIpc } from 'translime-sdk';

const PLUGIN_ID = 'translime-plugin-steam-save-backup';

// 模块级单例：多个组件共享同一份状态与轮询，避免重复请求
const status = ref(null);
let ipcInstance = null;
let pollTimer = null;

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

// 只拉取一次状态，不管理轮询
const fetchStatus = async () => {
  try {
    const res = await getIpc().invoke(`sync-get-status@${PLUGIN_ID}`);
    if (res?.success) {
      status.value = res.status;
    }
  } catch {
    // 轮询失败保留上次状态
  }
  return status.value;
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
  await fetchStatus();
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

export const stopSyncStatusPolling = stopPolling;

/**
 * 每游戏的同步状态（docs/auto-sync-research.md §2 状态可见）：
 * 同步中 / 待上传（本地新备份未推送）/ 已同步（出现在上次对账报告中）
 */
export const gameSyncState = (gameId) => {
  const current = status.value;
  if (!current?.config?.enabled) {
    return null;
  }
  if (current.phase === 'running') {
    return { key: 'syncing', label: '同步中', icon: 'sync' };
  }
  const id = String(gameId);
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
