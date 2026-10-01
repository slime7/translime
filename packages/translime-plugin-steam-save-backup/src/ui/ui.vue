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
        <SteamBackupToolbar
          :collapsed="collapsed"
          :open-dir-loading="loading.openDir"
          :scan-loading="loading.scan"
          :sync-running="syncRunning"
          :sync-error="syncError"
          @open-backup-dir="openBackupDir"
          @add-custom-dir="customDirOpen = true"
          @scan-games="scanGames"
          @open-sync="syncDialogOpen = true"
        />
      </template>
    </mat-app-bar>

    <main class="save-backup-content">
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

    <GameDetailsDialog
      v-model="dialog.show"
      :selected-game="selectedGame"
      :backups="backups"
      :loading="loading"
      :can-backup="canBackup"
      :format-time="formatTime"
      @backup="backupGame"
      @restore="restoreBackup"
      @delete="deleteAppBackup"
      @edit-note="openNoteDialog"
    />

    <CustomSaveDirsDialog
      v-model="customDirOpen"
      @changed="scanGames"
    />

    <SyncSettingsDialog v-model="syncDialogOpen" />

    <mat-snackbar
      v-model="snackbar.show"
      :duration="3000"
      closable
    >
      <!-- snackbar 同样被 Teleport 到 @scope 隔离范围之外，样式必须内联 -->
      <span :style="snackbar.color === 'error' ? 'color: var(--mat-sys-color-inverse-primary)' : undefined">
        {{ snackbar.text }}
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
} from 'vue';
import { isPreviewMode } from 'translime-sdk';
import ConfirmDialog from './components/ConfirmDialog.vue';
import CustomSaveDirsDialog from './components/CustomSaveDirsDialog.vue';
import EmptyGamesState from './components/EmptyGamesState.vue';
import GameDetailsDialog from './components/GameDetailsDialog.vue';
import GameGrid from './components/GameGrid.vue';
import HiddenGamesPanel from './components/HiddenGamesPanel.vue';
import LoadingState from './components/LoadingState.vue';
import NoteDialog from './components/NoteDialog.vue';
import SteamBackupToolbar from './components/SteamBackupToolbar.vue';
import SyncSettingsDialog from './components/SyncSettingsDialog.vue';
import useSteamSaveBackup from './composables/useSteamSaveBackup';
import { refreshSyncStatus, stopSyncStatusPolling, syncStatus } from './composables/useSyncStatus';

defineOptions({
  name: 'SteamSaveBackupUi',
});

const layoutRef = ref(null);
const collapsed = ref(false);
const customDirOpen = ref(false);
const syncDialogOpen = ref(false);
const previewMode = isPreviewMode();

const syncRunning = computed(() => syncStatus.value?.phase === 'running');
const syncError = computed(() => Boolean(
  syncStatus.value?.config?.enabled
  && syncStatus.value?.phase !== 'running'
  && syncStatus.value?.lastError,
));

let resizeObserver;

onMounted(() => {
  // 按插件页面实际宽度收缩工具栏为图标按钮，兼容内嵌 webview 与独立窗口两种宿主形态
  resizeObserver = new ResizeObserver((entries) => {
    collapsed.value = entries[0].contentRect.width < 640;
  });
  resizeObserver.observe(layoutRef.value?.$el ?? layoutRef.value);
  refreshSyncStatus();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
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
  openBackupDir,
  scanGames,
  openGameDetails,
  backupGame,
  handleConfirm,
  restoreBackup,
  deleteAppBackup,
  excludeGame,
  includeGame,
  openNoteDialog,
  saveNote,
} = useSteamSaveBackup();
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
  /* 插件文档即整个视口（内嵌 webview / 独立窗口）：高度锚定 dvh，
     不依赖宿主 #app 高度链，任何一环失效都不会退化成文档+内层双层滚动。
     首行 100% 作为不支持 dvh 引擎的回退 */
  height: 100%;
  height: 100dvh;
  box-sizing: border-box;
  /* 滚动容器是 layout 根本身：滚动条贴边，避免出现在内容 padding 内 */
  overflow: auto;
  overscroll-behavior: contain;
}

/* preview shell 中插件位于 v-main 内容区，不是全视口，回退为跟随容器 */
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
</style>
