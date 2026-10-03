<template>
  <div class="passthrough-view">
    <!-- 与备份区隔离的直通云存档区块：仅支持自定义目录，不产生本地备份 -->
    <div
      v-if="!configured"
      class="pt-hint-card"
    >
      <mat-icon
        icon="cloud_off"
        class="pt-hint-icon"
      />
      <div class="pt-hint-text">
        <div class="pt-hint-title">
          直通云存档未启用
        </div>
        <div class="pt-hint-desc">
          先在「同步」设置中配置远程目标，选定的存档目录将跳过本地备份，直接与远程镜像同步。
        </div>
      </div>
      <mat-btn
        variant="filled-tonal"
        prefix="cloud_sync"
        @click="$emit('open-sync')"
      >
        打开同步设置
      </mat-btn>
    </div>

    <template v-else>
      <div class="pt-toolbar">
        <div class="pt-toolbar-text">
          <div class="pt-title">
            直通云存档
          </div>
          <div class="pt-desc">
            存档目录变更自动同步到远程（较新者胜）。取消链接时可选删除远程存档。
          </div>
        </div>
        <div class="pt-toolbar-actions">
          <mat-btn
            variant="filled-tonal"
            prefix="cloud_sync"
            :loading="syncing"
            @click="syncNow"
          >
            立即同步
          </mat-btn>
          <mat-btn
            variant="filled"
            color="primary"
            prefix="add"
            @click="addOpen = true"
          >
            添加存档目录
          </mat-btn>
        </div>
      </div>

      <!-- 条目卡片：与备份区相同的卡片形态（无备份概念，展示直通状态） -->
      <div
        v-if="entries.length > 0"
        class="pt-grid"
      >
        <GameGrid
          :games="ptCards"
          @open-game="openDetails"
        />
      </div>

      <div
        v-else-if="!loading.list"
        class="pt-empty"
      >
        暂无直通条目，添加后本地变更将自动同步到远程。
      </div>

      <!-- 最近对账结果 -->
      <div class="pt-report">
        <span v-if="syncing">正在同步…</span>
        <span v-else-if="lastReport">
          上次对账：更新 {{ lastReport.updated.length }} · 应用远端删除 {{ lastReport.appliedDeletions.length }} · 冲突 {{ lastReport.conflicts.length }} · 失败 {{ lastReport.errors.length }}
        </span>
        <span v-else>尚未同步过</span>
        <span
          v-if="lastError"
          role="alert"
          class="pt-error-text"
        >
          {{ lastError }}
        </span>
      </div>
    </template>

    <PassthroughAddDialog
      ref="addDialogRef"
      v-model="addOpen"
      :loading="loading.add"
      @submit="onAddSubmit"
    />

    <PassthroughDetailsDialog
      v-model="detailsOpen"
      :entry="selectedEntry || { name: '', dir: '', entryId: '', localExists: true }"
      :status="selectedEntry ? entryStatus(selectedEntry) : null"
      :conflict="selectedConflict"
      :last-report="lastReport"
      :target="target"
      :sources="detailsSources"
      :files-loading="filesLoading"
      :unlink-loading="loading.remove === (selectedEntry && selectedEntry.name)"
      :resolve-loading="loading.resolve === (selectedEntry && selectedEntry.entryId)"
      :restore-loading="loading.restore === (selectedEntry && selectedEntry.name)"
      :syncing="syncing"
      :format-time="formatTime"
      @unlink="onUnlink"
      @resolve="onResolve"
      @restore="onRestore"
      @sync="syncNow"
      @open-dir="onOpenDir"
    />
  </div>
</template>

<script setup>
import {
  computed,
  onMounted,
  ref,
  watch,
} from 'vue';
import GameGrid from '../GameGrid.vue';
import PassthroughAddDialog from './PassthroughAddDialog.vue';
import PassthroughDetailsDialog from './PassthroughDetailsDialog.vue';
import usePassthrough from '../../composables/usePassthrough';
import {
  refreshSyncStatus,
  syncStatus,
  triggerSyncNow,
} from '../../composables/useSyncStatus';

const props = defineProps({
  // 轻量反馈走宿主页面的 snackbar（由 ui.vue 注入）
  notify: {
    type: Function,
    required: true,
  },
});

defineEmits(['open-sync']);

const {
  entries,
  loading,
  configured,
  syncing,
  conflicts,
  lastReport,
  lastError,
  entryStatus,
  load,
  addEntry,
  removeEntry,
  openDir,
  listFiles,
  restoreEntry,
  resolveConflict,
} = usePassthrough();

const addOpen = ref(false);
const addDialogRef = ref(null);
const detailsOpen = ref(false);
const selectedEntry = ref(null);

const showMessage = (text, color = 'success') => props.notify(text, color);

// 直通条目映射为与备份区一致的游戏卡片形态（kind 驱动 GameCard 的直通分支）
const ptCards = computed(() => entries.value.map((entry) => ({
  appid: entry.entryId,
  name: entry.name,
  kind: 'passthrough',
  ptStatus: entryStatus(entry),
})));

const selectedConflict = computed(() => {
  if (!selectedEntry.value) {
    return null;
  }
  return conflicts.value.find((item) => item.entryId === selectedEntry.value.entryId) || null;
});

// 远端位置复用备份同步的远程目标
const target = computed(() => syncStatus.value?.config?.target || '');

onMounted(() => {
  load();
  refreshSyncStatus();
});

// 对账结束（可能应用了远端删除）后刷新条目存在性
watch(syncing, (running, wasRunning) => {
  if (wasRunning && !running) {
    load();
  }
});

const formatTime = (isoString) => (isoString ? new Date(isoString).toLocaleString('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
}) : '');

const onAddSubmit = async ({ name, dir }, setFormError) => {
  const res = await addEntry({ name, dir });
  if (res.success) {
    addDialogRef.value?.reset();
    addOpen.value = false;
    showMessage(`已添加直通存档「${name}」，开始与远程同步`);
  } else {
    setFormError(res.message || '添加失败');
  }
};

const openDetails = (card) => {
  const entry = entries.value.find((item) => item.entryId === card.appid);
  if (!entry) {
    return;
  }
  selectedEntry.value = entry;
  detailsOpen.value = true;
};

// 详情弹窗打开时枚举本地目录文件（路径面板展示具体内容）
const detailsSources = ref([]);
const filesLoading = ref(false);
watch([detailsOpen, selectedEntry], async ([open, entry]) => {
  if (!open || !entry) {
    return;
  }
  filesLoading.value = true;
  detailsSources.value = [];
  try {
    const res = await listFiles(entry.name);
    if (res.success) {
      detailsSources.value = res.sources || [];
    }
  } finally {
    filesLoading.value = false;
  }
});

const onUnlink = async (deleteRemote) => {
  const entry = selectedEntry.value;
  if (!entry) {
    return;
  }
  const res = await removeEntry(entry.name, deleteRemote);
  if (res.success) {
    detailsOpen.value = false;
    showMessage(deleteRemote
      ? `已取消链接「${entry.name}」，远端存档已删除并写入删除标记`
      : `已取消链接「${entry.name}」，本地存档保持原样`);
  } else {
    showMessage(res.message || '取消链接失败', 'error');
  }
};

const onResolve = async (mode) => {
  const entry = selectedEntry.value;
  if (!entry) {
    return;
  }
  const res = await resolveConflict({ entryId: entry.entryId, mode });
  if (res.success) {
    showMessage(mode === 'keep-local'
      ? `已保留本机存档「${entry.name}」并撤销远端删除`
      : `已确认删除存档「${entry.name}」`);
  } else {
    showMessage(res.message || '处理失败', 'error');
  }
};

const onOpenDir = async () => {
  const entry = selectedEntry.value;
  if (!entry) {
    return;
  }
  const res = await openDir(entry.name);
  if (!res.success) {
    showMessage(res.message || '打开目录失败', 'error');
  }
};

const onRestore = async () => {
  const entry = selectedEntry.value;
  if (!entry) {
    return;
  }
  const res = await restoreEntry(entry.name);
  if (res.success) {
    showMessage(`存档「${entry.name}」已从远程回补`);
  } else {
    showMessage(res.message || '回补失败', 'error');
  }
};

const syncNow = async () => {
  const res = await triggerSyncNow();
  if (!res?.success) {
    showMessage(res?.message || '触发同步失败', 'error');
  }
};
</script>

<style scoped>
.passthrough-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pt-hint-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--mat-sys-color-outline-variant);
  border-radius: 16px;
}

.pt-hint-icon {
  color: var(--mat-sys-color-on-surface-variant);
  flex-shrink: 0;
}

.pt-hint-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pt-hint-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--mat-sys-color-on-surface);
}

.pt-hint-desc {
  font-size: .8125rem;
  color: var(--mat-sys-color-on-surface-variant);
}

.pt-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.pt-toolbar-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.pt-title {
  font-size: 1.0625rem;
  font-weight: 600;
  color: var(--mat-sys-color-on-surface);
}

.pt-desc {
  font-size: .8125rem;
  color: var(--mat-sys-color-on-surface-variant);
}

.pt-toolbar-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.pt-grid {
  margin: 0 -4px;
}

.pt-empty {
  padding: 24px;
  border: 1px dashed var(--mat-sys-color-outline-variant);
  border-radius: 12px;
  font-size: .875rem;
  color: var(--mat-sys-color-on-surface-variant);
  text-align: center;
}

.pt-report {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: .8125rem;
  color: var(--mat-sys-color-on-surface-variant);
}

.pt-error-text {
  color: var(--mat-sys-color-error);
  word-break: break-all;
}
</style>
