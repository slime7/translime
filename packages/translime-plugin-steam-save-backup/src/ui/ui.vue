<template>
  <v-container
    fluid
    class="h-full p-4"
  >
    <SteamBackupToolbar
      :open-dir-loading="loading.openDir"
      :scan-loading="loading.scan"
      @open-backup-dir="openBackupDir"
      @scan-games="scanGames"
    />

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

    <v-snackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      timeout="3000"
      location="top"
    >
      {{ snackbar.text }}

      <template #actions>
        <v-btn
          color="white"
          variant="text"
          @click="snackbar.show = false"
        >
          关闭
        </v-btn>
      </template>
    </v-snackbar>

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
  </v-container>
</template>

<script setup>
import { useVuetifyComponents } from 'translime-sdk';
import ConfirmDialog from './components/ConfirmDialog.vue';
import EmptyGamesState from './components/EmptyGamesState.vue';
import GameDetailsDialog from './components/GameDetailsDialog.vue';
import GameGrid from './components/GameGrid.vue';
import HiddenGamesPanel from './components/HiddenGamesPanel.vue';
import LoadingState from './components/LoadingState.vue';
import NoteDialog from './components/NoteDialog.vue';
import SteamBackupToolbar from './components/SteamBackupToolbar.vue';
import useSteamSaveBackup from './composables/useSteamSaveBackup';

const vuetifyComponents = useVuetifyComponents();
const VBtn = vuetifyComponents.VBtn;
const VContainer = vuetifyComponents.VContainer;
const VSnackbar = vuetifyComponents.VSnackbar;

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
.overflow-y-auto::-webkit-scrollbar {
  width: 8px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background-color: rgb(0 0 0 / 20%);
  border-radius: 4px;
}

.text-break-all {
  word-break: break-all;
}
</style>
