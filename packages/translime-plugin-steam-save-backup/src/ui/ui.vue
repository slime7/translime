<template>
  <mat-layout
    ref="layoutRef"
    class="save-backup-page"
    :class="{ 'preview-mode': previewMode }"
  >
    <mat-app-bar
      variant="small"
      :scroll-target="layoutRef"
    >
      <span class="page-bar-title">Steam 存档备份</span>

      <template #trailing>
        <div class="bar-trailing">
          <!-- 备份区工具栏 -->
          <SteamBackupToolbar
            v-if="activeView === 'backup'"
            :collapsed="collapsed"
            :scan-loading="loading.scan"
            @add-custom-dir="customDirOpen = true"
            @scan-games="scanGames"
          />

          <!-- 视图切换：存档备份 / 直通云存档 -->
          <mat-btn-group
            variant="connected"
            selection="single"
            shape="square"
            size="small"
            :selected="activeView"
            @select="activeView = $event.nextSelected"
          >
            <mat-btn
              value="backup"
              icon="backup"
              label="存档备份"
            />
            <mat-btn
              value="passthrough"
              icon="cloud_sync"
              label="直通云存档"
            />
          </mat-btn-group>
        </div>
      </template>
    </mat-app-bar>

    <main
      v-if="activeView === 'backup'"
      class="save-backup-content"
    >
      <LoadingState v-if="loading.scan && games.length === 0" />

      <GameGrid
        v-if="visibleGames.length > 0"
        :games="visibleGames"
        :exclude-loading="loading.exclude"
        @open-game="openGameDetails"
        @exclude-game="excludeGame"
      />

      <HiddenGamesPanel
        v-if="hiddenGames.length > 0"
        :games="hiddenGames"
        :exclude-loading="loading.exclude"
        @include-game="includeGame"
      />

      <EmptyGamesState
        v-if="!loading.scan && visibleGames.length === 0 && hiddenGames.length === 0"
        @scan="scanGames"
      />
    </main>

    <main
      v-else
      class="save-backup-content"
    >
      <PassthroughView
        :notify="showSyncSnackbar"
        @open-sync="syncDialogOpen = true"
      />
    </main>

    <GameDetailsDialog
      v-model="dialog.show"
      :selected-game="selectedGame"
      :backups="backups"
      :loading="loading"
      :can-backup="canBackup"
      :sync-running="syncRunning"
      :sync-available="syncAvailable"
      :format-time="formatTime"
      @backup="backupGame"
      @sync="syncNow"
      @restore="restoreBackup"
      @delete="deleteAppBackup"
      @edit-note="openNoteDialog"
    />

    <CustomSaveDirsDialog
      v-model="customDirOpen"
      @changed="scanGames"
    />

    <DiscoverRemoteBackupsDialog
      v-model="discoverDialogOpen"
      @changed="scanGames"
    />

    <SyncSettingsDialog v-model="syncDialogOpen" />

    <mat-snackbar
      v-model="snackbar.show"
      :duration="3000"
      closable
    >
      <!-- 提示条内容需使用内联样式 -->
      <span :style="snackbar.color === 'error' ? 'color: var(--mat-sys-color-inverse-primary)' : undefined">
        {{ snackbar.text }}
      </span>
    </mat-snackbar>

    <mat-snackbar
      v-model="syncSnackbar.show"
      :duration="6000"
      closable
    >
      <span :style="syncSnackbar.color === 'error' ? 'color: var(--mat-sys-color-inverse-primary)' : undefined">
        {{ syncSnackbar.text }}
      </span>
    </mat-snackbar>

    <NoteDialog
      v-model="noteDialog.show"
      v-model:note="noteDialog.note"
      :loading="noteDialog.loading"
      @save="saveNote"
    />

    <ConfirmDialog
      v-model="confirmDialog.show"
      :dialog="confirmDialog"
      @confirm="handleConfirm"
    />
  </mat-layout>
</template>

<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { isPreviewMode, useIpc } from 'translime-sdk';
import ConfirmDialog from './components/ConfirmDialog.vue';
import CustomSaveDirsDialog from './components/CustomSaveDirsDialog.vue';
import DiscoverRemoteBackupsDialog from './components/DiscoverRemoteBackupsDialog.vue';
import EmptyGamesState from './components/EmptyGamesState.vue';
import GameDetailsDialog from './components/GameDetailsDialog.vue';
import GameGrid from './components/GameGrid.vue';
import HiddenGamesPanel from './components/HiddenGamesPanel.vue';
import LoadingState from './components/LoadingState.vue';
import NoteDialog from './components/NoteDialog.vue';
import PassthroughView from './components/passthrough/PassthroughView.vue';
import SteamBackupToolbar from './components/SteamBackupToolbar.vue';
import SyncSettingsDialog from './components/SyncSettingsDialog.vue';
import useSteamSaveBackup from './composables/useSteamSaveBackup';
import {
  refreshSyncStatus,
  stopSyncStatusPolling,
  syncStatus,
  triggerSyncNow,
} from './composables/useSyncStatus';

defineOptions({
  name: 'SteamSaveBackupUi',
});

const PLUGIN_ID = 'translime-plugin-steam-save-backup';

const layoutRef = ref(null);
const collapsed = ref(false);
const customDirOpen = ref(false);
const discoverDialogOpen = ref(false);
const syncDialogOpen = ref(false);
const activeView = ref('backup');
const previewMode = isPreviewMode();

const syncSnackbar = ref({ show: false, text: '', color: 'success' });
const showSyncSnackbar = (text, color = 'success') => {
  syncSnackbar.value = { show: true, text, color };
};

const syncRunning = computed(() => syncStatus.value?.phase === 'running');
const syncAvailable = computed(() => Boolean(syncStatus.value?.config?.target));

// 触发同步对账
const syncNow = async () => {
  if (!syncAvailable.value) {
    showSyncSnackbar('请先在同步设置中配置存档位置', 'error');
    return;
  }
  const res = await triggerSyncNow();
  if (!res?.success) {
    showSyncSnackbar(res?.message || '触发同步失败', 'error');
  }
};

// 检测到新冲突时提示
const knownConflictKeys = ref(new Set());
watch(syncStatus, (status) => {
  const conflicts = status?.conflicts || [];
  if (conflicts.length === 0) {
    knownConflictKeys.value = new Set();
    return;
  }
  const fresh = conflicts.filter((item) => !knownConflictKeys.value.has(`${item.gameId}:${item.dir}`));
  if (knownConflictKeys.value.size > 0 && fresh.length > 0) {
    showSyncSnackbar(`检测到 ${fresh.length} 个同步冲突，请在“同步”设置中处理`, 'error');
  }
  knownConflictKeys.value = new Set(conflicts.map((item) => `${item.gameId}:${item.dir}`));
}, { deep: true });

// 监听主进程后台通知事件
const ipc = useIpc(PLUGIN_ID);
const onSyncNotify = (payload) => {
  // 响应打开同步设置
  if (payload?.kind === 'open-sync-settings') {
    syncDialogOpen.value = true;
    return;
  }
  // 响应打开远程发现
  if (payload?.kind === 'open-remote-discovery') {
    discoverDialogOpen.value = true;
    return;
  }
  refreshSyncStatus();
  if (payload?.kind === 'auto-backup') {
    showSyncSnackbar(`已自动备份「${payload.gameName}」`);
    return;
  }
  if (payload?.kind === 'backup-deleted') {
    showSyncSnackbar(`远端已删除的备份已从本机移除：${payload.gameName || payload.dir}`, 'error');
    return;
  }
  if (payload?.kind === 'passthrough-deleted') {
    showSyncSnackbar(`远端已删除，本地存档「${payload.name}」已跟随移除`, 'error');
  }
};

let resizeObserver;

onMounted(() => {
  // 响应式调整工具栏模式
  resizeObserver = new ResizeObserver((entries) => {
    collapsed.value = entries[0].contentRect.width < 640;
  });
  resizeObserver.observe(layoutRef.value?.$el ?? layoutRef.value);
  refreshSyncStatus();
  ipc?.on('sync-notify', onSyncNotify);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  ipc?.detach('sync-notify', onSyncNotify);
  stopSyncStatusPolling();
});

const {
  loading,
  games,
  selectedGame,
  backups,
  snackbar,
  dialog,
  noteDialog,
  confirmDialog,
  visibleGames,
  hiddenGames,
  canBackup,
  formatTime,
  scanGames,
  openGameDetails,
  loadBackups,
  backupGame,
  handleConfirm,
  restoreBackup,
  deleteAppBackup,
  excludeGame,
  includeGame,
  openNoteDialog,
  saveNote,
} = useSteamSaveBackup();

// 同步结束后刷新备份列表
watch(syncRunning, (running, wasRunning) => {
  if (wasRunning && !running) {
    if (dialog.value.show && selectedGame.value) {
      loadBackups(selectedGame.value.appid);
    }
    scanGames();
  }
});
</script>

<style>
@layer tailwind {
  @layer theme, utilities;
  @import 'tailwindcss/theme.css' layer(theme);
  @import 'tailwindcss/utilities.css' layer(utilities);
}
</style>

<style scoped>
.save-backup-page {
  height: 100%;
  height: 100dvh;
  box-sizing: border-box;
  overflow: auto;
  overscroll-behavior: contain;
}

.save-backup-page.preview-mode {
  height: 100%;
}

.page-bar-title {
  color: var(--mat-sys-color-primary);
  font-size: 1.5rem;
  font-weight: 700;
  white-space: nowrap;
}

.save-backup-content {
  padding: 16px;
}

.bar-trailing {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
