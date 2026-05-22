import {
  computed,
  onMounted,
  ref,
  toRaw,
} from 'vue';
import { useIpc } from 'translime-sdk';
import {
  saveSourcesToSavePaths,
  steamSavePathsToSaveSources,
} from '../../utils/save-sources';

const PLUGIN_ID = 'translime-plugin-steam-save-backup';

const formatTime = (isoString) => new Date(isoString).toLocaleString('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const getGameSaveSources = (game) => {
  if (Array.isArray(game?.saveSources)) {
    return game.saveSources;
  }

  return steamSavePathsToSaveSources(game?.savePaths);
};

export default function useSteamSaveBackup() {
  const ipc = useIpc();
  const loading = ref({
    scan: false,
    openDir: false,
    backup: false,
    restore: null,
    delete: null,
    exclude: null,
  });
  const games = ref([]);
  const selectedGame = ref(null);
  const backups = ref([]);
  const snackbar = ref({ show: false, text: '', color: 'success' });
  const dialog = ref({ show: false });
  const noteDialog = ref({
    show: false,
    note: '',
    backup: null,
    loading: false,
  });
  const confirmDialog = ref({
    show: false,
    title: '',
    message: '',
    detail: '',
    icon: '',
    color: 'primary',
    confirmText: '确定',
    onConfirm: null,
    loading: false,
  });

  const visibleGames = computed(() => games.value.filter((game) => !game.excluded));
  const hiddenGames = computed(() => games.value.filter((game) => game.excluded));
  const canBackup = computed(() => saveSourcesToSavePaths(getGameSaveSources(selectedGame.value)).length > 0);

  const showMessage = (text, color = 'success') => {
    snackbar.value = { show: true, text, color };
  };

  const loadBackups = async (gameId) => {
    try {
      const res = await ipc.invoke(`get-backups@${PLUGIN_ID}`, gameId);
      if (res.success) {
        backups.value = res.backups || [];
        if (selectedGame.value) {
          selectedGame.value.backupCount = backups.value.length;
          const gameInList = games.value.find((game) => game.appid === selectedGame.value.appid);
          if (gameInList) {
            gameInList.backupCount = backups.value.length;
          }
        }
      } else {
        console.error('加载备份失败', res.message);
        showMessage('无法加载备份列表', 'error');
      }
    } catch (err) {
      console.error('加载备份失败', err);
      showMessage('无法加载备份列表', 'error');
    }
  };

  const openBackupDir = async () => {
    loading.value.openDir = true;
    try {
      const res = await ipc.invoke(`open-backup-dir@${PLUGIN_ID}`);
      if (!res.success) {
        showMessage(res.message || '打开目录失败', 'error');
      }
    } catch (err) {
      showMessage(err.message || '打开目录失败', 'error');
    } finally {
      loading.value.openDir = false;
    }
  };

  const scanGames = async () => {
    loading.value.scan = true;
    try {
      const res = await ipc.invoke(`scan-games@${PLUGIN_ID}`);
      if (res.success) {
        games.value = res.games || [];
        if (selectedGame.value) {
          const updated = games.value.find((game) => game.appid === selectedGame.value.appid);
          if (updated) {
            selectedGame.value.name = updated.name;
            selectedGame.value.backupCount = updated.backupCount;
            selectedGame.value.savePaths = updated.savePaths;
            selectedGame.value.saveSources = updated.saveSources;
          }
        }
      } else {
        showMessage(res.message || '扫描失败', 'error');
      }
    } catch (err) {
      showMessage(err.message || '扫描失败', 'error');
    } finally {
      loading.value.scan = false;
    }
  };

  const openGameDetails = (game) => {
    selectedGame.value = game;
    backups.value = [];
    dialog.value.show = true;
    loadBackups(game.appid);
  };

  const backupGame = async () => {
    if (!selectedGame.value || !canBackup.value) {
      return;
    }

    const saveSources = getGameSaveSources(selectedGame.value);
    const validPaths = saveSourcesToSavePaths(saveSources);
    if (validPaths.length === 0) {
      showMessage('未找到有效的存档路径', 'error');
      return;
    }

    loading.value.backup = true;
    try {
      const res = await ipc.invoke(
        `backup-save@${PLUGIN_ID}`,
        toRaw({
          gameId: selectedGame.value.appid,
          gameName: selectedGame.value.name,
          savePaths: JSON.parse(JSON.stringify(validPaths)),
          saveSources: JSON.parse(JSON.stringify(saveSources)),
        }),
      );
      if (res.success) {
        showMessage('备份创建成功');
        if (selectedGame.value) {
          loadBackups(selectedGame.value.appid);
        }
      } else {
        showMessage(res.message || '备份失败', 'error');
      }
    } catch (err) {
      showMessage(err.message || '备份失败', 'error');
    } finally {
      loading.value.backup = false;
    }
  };

  const handleConfirm = async () => {
    if (!confirmDialog.value.onConfirm) {
      return;
    }

    confirmDialog.value.loading = true;
    try {
      await confirmDialog.value.onConfirm();
    } finally {
      confirmDialog.value.loading = false;
      confirmDialog.value.show = false;
    }
  };

  const restoreBackup = (backup) => {
    confirmDialog.value = {
      show: true,
      title: '还原备份',
      icon: 'settings_backup_restore',
      color: 'primary',
      message: `确定要还原 ${formatTime(backup.backupTime)} 的备份吗？`,
      detail: '当前存档将被覆盖。',
      confirmText: '立即还原',
      onConfirm: async () => {
        loading.value.restore = backup.id;
        try {
          const res = await ipc.invoke(`restore-save@${PLUGIN_ID}`, backup.path);
          if (res.success) {
            showMessage('还原成功');
          } else {
            showMessage(res.message || '还原失败', 'error');
          }
        } catch (err) {
          showMessage(err.message || '还原失败', 'error');
        } finally {
          loading.value.restore = null;
        }
      },
    };
  };

  const deleteAppBackup = (backup) => {
    confirmDialog.value = {
      show: true,
      title: '删除备份',
      icon: 'delete',
      color: 'error',
      message: `确定要删除 ${formatTime(backup.backupTime)} 的备份吗？`,
      detail: '此操作不可撤销。',
      confirmText: '确认删除',
      onConfirm: async () => {
        loading.value.delete = backup.id;
        try {
          const res = await ipc.invoke(`delete-backup@${PLUGIN_ID}`, backup.path);
          if (res.success) {
            showMessage('备份已删除');
            if (selectedGame.value) {
              loadBackups(selectedGame.value.appid);
            }
          } else {
            showMessage(res.message || '删除失败', 'error');
          }
        } catch (err) {
          showMessage(err.message || '删除失败', 'error');
        } finally {
          loading.value.delete = null;
        }
      },
    };
  };

  const excludeGame = (game) => {
    confirmDialog.value = {
      show: true,
      title: '隐藏游戏',
      icon: 'visibility_off',
      color: 'warning',
      message: `确定要隐藏游戏 "${game.name}" 吗？`,
      detail: '隐藏后可在下方“已隐藏的游戏”中恢复。',
      confirmText: '确认隐藏',
      onConfirm: async () => {
        loading.value.exclude = game.appid;
        try {
          const res = await ipc.invoke(`exclude-game@${PLUGIN_ID}`, game.appid);
          if (res.success) {
            showMessage('游戏已隐藏');
            const gameItem = games.value.find((item) => String(item.appid) === res.appid);
            if (gameItem) {
              gameItem.excluded = true;
            }
          } else {
            showMessage(res.message || '隐藏失败', 'error');
          }
        } catch (err) {
          showMessage(err.message || '隐藏失败', 'error');
        } finally {
          loading.value.exclude = null;
        }
      },
    };
  };

  const includeGame = async (game) => {
    loading.value.exclude = game.appid;
    try {
      const res = await ipc.invoke(`include-game@${PLUGIN_ID}`, game.appid);
      if (res.success) {
        showMessage('游戏已恢复显示');
        const gameItem = games.value.find((item) => String(item.appid) === res.appid);
        if (gameItem) {
          gameItem.excluded = false;
        }
      } else {
        showMessage(res.message || '恢复失败', 'error');
      }
    } catch (err) {
      showMessage(err.message || '恢复失败', 'error');
    } finally {
      loading.value.exclude = null;
    }
  };

  const openNoteDialog = (backup) => {
    noteDialog.value.backup = backup;
    noteDialog.value.note = backup.note || '';
    noteDialog.value.show = true;
  };

  const saveNote = async () => {
    if (!noteDialog.value.backup) {
      return;
    }

    noteDialog.value.loading = true;
    try {
      const res = await ipc.invoke(`update-backup-note@${PLUGIN_ID}`, {
        backupPath: noteDialog.value.backup.path,
        note: noteDialog.value.note,
      });
      if (res.success) {
        showMessage('备注已更新');
        noteDialog.value.show = false;
        if (noteDialog.value.backup) {
          noteDialog.value.backup.note = res.note;
        }
      } else {
        showMessage(res.message || '更新备注失败', 'error');
      }
    } catch (err) {
      showMessage(err.message || '更新备注失败', 'error');
    } finally {
      noteDialog.value.loading = false;
    }
  };

  onMounted(() => {
    scanGames();
  });

  return {
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
  };
}
