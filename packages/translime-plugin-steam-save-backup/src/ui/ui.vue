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
        <!-- 视图切换：自动检测 / 自定义存档 / 直通存档 -->
        <mat-btn-group
          variant="connected"
          selection="single"
          shape="square"
          size="small"
          :selected="activeView"
          @select="activeView = $event.nextSelected"
        >
          <mat-btn
            value="auto"
            icon="radar"
            label="自动检测"
          />
          <mat-btn
            value="custom"
            icon="create_new_folder"
            label="自定义存档"
          />
          <mat-btn
            value="passthrough"
            icon="cloud_sync"
            label="直通存档"
          />
        </mat-btn-group>
      </template>
    </mat-app-bar>

    <!-- 自动检测页：Steam 扫描结果与已卸载登记游戏，保留云存档内容（有些非游戏也带云存档） -->
    <main
      v-if="activeView === 'auto'"
      class="save-backup-content"
    >
      <PageHeader
        title="自动检测游戏"
        description="扫描 Steam 库自动发现的存档，含带云存档的非游戏应用与已卸载游戏"
      >
        <template #actions>
          <mat-btn
            variant="filled-tonal"
            prefix="refresh"
            :loading="loading.scan"
            @click="scanGames"
          >
            刷新列表
          </mat-btn>
        </template>
      </PageHeader>

      <LoadingState v-if="loading.scan && games.length === 0" />

      <template v-else>
        <GameGrid
          v-if="visibleAutoGames.length > 0"
          :games="visibleAutoGames"
          :exclude-loading="loading.exclude"
          @open-game="openGameDetails"
          @exclude-game="excludeGame"
        />

        <HiddenGamesPanel
          v-if="hiddenAutoGames.length > 0"
          :games="hiddenAutoGames"
          :exclude-loading="loading.exclude"
          @include-game="includeGame"
        />

        <EmptyGamesState
          v-if="!loading.scan && visibleAutoGames.length === 0 && hiddenAutoGames.length === 0"
          title="未发现可自动检测的游戏"
          hint="可在插件设置中配置 Steam 路径，或手动添加存档目录"
          action-text="重新扫描"
          @action="scanGames"
        />
      </template>
    </main>

    <!-- 自定义存档页：手动登记的游戏存档目录 -->
    <main
      v-else-if="activeView === 'custom'"
      class="save-backup-content"
    >
      <PageHeader
        title="自定义游戏存档"
        description="手动登记的存档目录，支持非 Steam 游戏；与自动检测游戏同名的目录会并入该游戏"
      >
        <template #actions>
          <mat-btn
            variant="filled-tonal"
            prefix="create_new_folder"
            @click="customDirOpen = true"
          >
            手动添加
          </mat-btn>
        </template>
      </PageHeader>

      <LoadingState v-if="loading.scan && games.length === 0" />

      <template v-else>
        <GameGrid
          v-if="visibleCustomGames.length > 0"
          :games="visibleCustomGames"
          :exclude-loading="loading.exclude"
          @open-game="openGameDetails"
          @exclude-game="excludeGame"
        />

        <HiddenGamesPanel
          v-if="hiddenCustomGames.length > 0"
          :games="hiddenCustomGames"
          :exclude-loading="loading.exclude"
          @include-game="includeGame"
        />

        <EmptyGamesState
          v-if="!loading.scan && visibleCustomGames.length === 0 && hiddenCustomGames.length === 0"
          icon="create_new_folder"
          title="暂无自定义存档"
          hint="通过「手动添加」登记游戏存档目录，支持非 Steam 游戏"
          action-text="手动添加"
          @action="customDirOpen = true"
        />
      </template>
    </main>

    <!-- 直通存档页 -->
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
import PageHeader from './components/PageHeader.vue';
import PassthroughView from './components/passthrough/PassthroughView.vue';
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
const customDirOpen = ref(false);
const discoverDialogOpen = ref(false);
const syncDialogOpen = ref(false);
const activeView = ref('auto');
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

onMounted(() => {
  refreshSyncStatus();
  ipc?.on('sync-notify', onSyncNotify);
});

onBeforeUnmount(() => {
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
  visibleAutoGames,
  hiddenAutoGames,
  visibleCustomGames,
  hiddenCustomGames,
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
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}
</style>
