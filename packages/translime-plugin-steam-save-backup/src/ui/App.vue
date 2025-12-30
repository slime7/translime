<template>
  <v-container fluid class="fill-height pa-4 align-start">
    <!-- 顶部工具栏 -->
    <v-toolbar density="compact" color="transparent" class="mb-4">
      <v-toolbar-title class="text-h5 font-weight-bold text-primary">
        Steam 存档备份
      </v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn
        prepend-icon="refresh"
        variant="tonal"
        color="primary"
        @click="scanGames"
        :loading="loading"
      >
        刷新列表
      </v-btn>
    </v-toolbar>

    <!-- 游戏列表 (卡片网格) -->
    <v-row v-if="loading && games.length === 0">
      <v-col cols="12" class="text-center mt-10">
        <v-progress-circular indeterminate color="primary" size="64"></v-progress-circular>
        <div class="mt-4 text-grey">正在扫描 Steam 游戏...</div>
      </v-col>
    </v-row>

    <v-row v-else-if="games.length > 0">
      <v-col
        v-for="game in games"
        :key="game.appid"
        cols="12"
        sm="6"
        md="4"
        lg="3"
        xl="2"
      >
        <v-card
          class="mx-auto fill-height d-flex flex-column"
          elevation="2"
          @click="openGameDetails(game)"
          hover
        >
          <div class="d-flex flex-row align-center pa-4">
            <v-avatar color="primary" size="56" status="active">
              <span class="text-h5 font-weight-bold text-white">
                {{ game.name.charAt(0).toUpperCase() }}
              </span>
            </v-avatar>
            <div class="ml-4 overflow-hidden">
              <div class="text-h6 text-truncate font-weight-medium">
                {{ game.name }}
              </div>
              <div class="text-caption text-grey-darken-1">
                APP ID: {{ game.appid }}
              </div>
            </div>
          </div>

          <v-divider></v-divider>

          <v-card-text class="pt-2 pb-2">
            <div class="d-flex justify-space-between align-center">
              <v-chip
                size="small"
                :color="game.backupCount > 0 ? 'success' : 'grey'"
                variant="flat"
                class="font-weight-medium"
              >
                {{ game.backupCount || 0 }} 个备份
              </v-chip>
              <v-icon color="grey-lighten-1" icon="chevron_right"></v-icon>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <div v-else-if="!loading" class="d-flex flex-column align-center justify-center fill-height w-100 mt-10">
      <v-icon size="80" color="grey-lighten-2">sports_esports</v-icon>
      <div class="text-h6 text-grey mt-4">未发现 Steam 游戏</div>
      <v-btn class="mt-4" color="primary" variant="text" @click="scanGames">重新扫描</v-btn>
    </div>

    <!-- 备份详情模态框 -->
    <v-dialog
      v-model="dialog.show"
      max-width="800px"
      scrollable
      transition="dialog-bottom-transition"
    >
      <v-card v-if="selectedGame" class="rounded-lg" height="80vh">
        <v-toolbar color="primary" density="compact" class="flex-grow-0">
          <v-toolbar-title>{{ selectedGame.name }} - 备份管理</v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn icon @click="dialog.show = false">
            <v-icon>close</v-icon>
          </v-btn>
        </v-toolbar>

        <v-card-text class="pa-0 flex-grow-1">
          <!-- 警告信息 -->
          <v-alert
            v-if="!canBackup"
            type="warning"
            variant="tonal"
            class="ma-4"
            icon="warning"
          >
            无法自动定位该游戏的存档路径，暂不支持备份。
          </v-alert>

          <!-- 备份列表 -->
          <div v-if="backups.length > 0" class="pa-4">
            <v-card
              v-for="backup in backups"
              :key="backup.id"
              class="mb-3"
              elevation="1"
              border
            >
              <v-list-item class="pa-3">
                <template v-slot:prepend>
                <v-avatar color="blue-lighten-5" icon="history" color-icon="primary"></v-avatar>
                </template>

                <v-list-item-title class="font-weight-bold">
                  {{ formatTime(backup.backupTime) }}
                </v-list-item-title>
                <v-list-item-subtitle class="mt-1 text-caption">
                  路径: {{ backup.originalPath || '多路径备份' }}
                </v-list-item-subtitle>

                <template v-slot:append>
                <div class="d-flex align-center gap-2">
                  <v-tooltip text="还原此备份" location="top">
                    <template v-slot:activator="{ props }">
                    <v-btn
                      v-bind="props"
                      variant="elevated"
                      color="primary"
                      size="small"
                      prepend-icon="settings_backup_restore"
                      class="mr-2"
                      @click="restoreBackup(backup)"
                      :loading="restoreLoading === backup.id"
                    >
                      还原
                    </v-btn>
                    </template>
                  </v-tooltip>

                  <v-tooltip text="删除备份" location="top">
                    <template v-slot:activator="{ props }">
                    <v-btn
                      v-bind="props"
                      variant="text"
                      color="error"
                      icon="delete"
                      size="small"
                      @click="deleteAppBackup(backup)"
                      :loading="deleteLoading === backup.id"
                    >
                    </v-btn>
                    </template>
                  </v-tooltip>
                </div>
                </template>
              </v-list-item>
            </v-card>
          </div>

          <!-- 空状态 -->
          <div v-else class="d-flex flex-column align-center justify-center fill-height py-10 text-grey">
            <v-icon size="64" color="grey-lighten-2">inventory_2</v-icon>
            <div class="mt-2">暂无备份记录</div>
          </div>
        </v-card-text>

        <v-divider></v-divider>

        <v-card-actions class="pa-4">
          <v-spacer></v-spacer>
          <v-btn
            variant="text"
            @click="dialog.show = false"
          >
            关闭
          </v-btn>
          <v-btn
            color="primary"
            prepend-icon="cloud_upload"
            variant="elevated"
            @click="backupGame"
            :loading="backupLoading"
            :disabled="!canBackup"
          >
            立即备份
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3000" location="top">
      {{ snackbar.text }}
      <template v-slot:actions>
      <v-btn color="white" variant="text" @click="snackbar.show = false">关闭</v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>

<script setup>
import {
  ref,
  computed,
  onMounted,
  toRaw,
} from 'vue';

// 从全局对象获取 Vuetify 组件
// 注意：实际运行时环境中已有 Vuetify 全局变量，这里解构仅作参考或 IDE 提示
// 如果是 ESM 构建，通常不需要这样手动解构，但为了兼容原有代码风格保持一致
const {
  VContainer, VRow, VCol,
  VToolbar, VToolbarTitle, VSpacer, VBtn, VIcon,
  VListItem, VAvatar, VListItemTitle, VListItemSubtitle,
  VAlert, VCard, VCardActions, VCardText,
  VSnackbar, VDialog, VProgressCircular, VDivider, VChip, VTooltip,
} = window.vuetify$?.components || {};

// 插件 ID
const PLUGIN_ID = 'translime-plugin-steam-save-backup';

// IPC
const ipc = window.electron.useIpc();

// 状态
const loading = ref(false);
const backupLoading = ref(false);
const restoreLoading = ref(null); // 存储正在还原的备份 ID
const deleteLoading = ref(null); // 存储正在删除的备份 ID
const games = ref([]);
const selectedGame = ref(null);
const backups = ref([]);
const snackbar = ref({ show: false, text: '', color: 'success' });
const dialog = ref({ show: false });

// 计算属性
const canBackup = computed(() => selectedGame.value && selectedGame.value.savePaths && selectedGame.value.savePaths.length > 0);

// 格式化时间
const formatTime = (isoString) => new Date(isoString).toLocaleString('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

// 显示消息
const showMessage = (text, color = 'success') => {
  snackbar.value = { show: true, text, color };
};

// 加载备份列表
const loadBackups = (gameId) => {
  ipc.send(`get-backups@${PLUGIN_ID}`, gameId);
};

// 监听 IPC 回复
const setupIpcListeners = () => {
  // 扫描结果
  ipc.on(`scan-games-reply@${PLUGIN_ID}`, (res) => {
    loading.value = false;
    if (res.success) {
      games.value = res.games || [];
      // 如果当前正在查看某个游戏详情，更新其备份数显示等（虽然详情页备份数不直接显示，但保持数据一致）
      if (selectedGame.value) {
        const updated = games.value.find((g) => g.appid === selectedGame.value.appid);
        if (updated) {
          // 只更新基本信息，不覆盖正在操作的状态
          selectedGame.value.name = updated.name;
          selectedGame.value.backupCount = updated.backupCount;
        }
      }
    } else {
      showMessage(res.message || '扫描失败', 'error');
    }
  });

  // 备份列表结果
  ipc.on(`get-backups-reply@${PLUGIN_ID}`, (res) => {
    if (res.success) {
      backups.value = res.backups || [];
      // 更新游戏列表中的数量
      if (selectedGame.value) {
        selectedGame.value.backupCount = backups.value.length;
        // 同步更新主列表
        const gameInList = games.value.find((g) => g.appid === selectedGame.value.appid);
        if (gameInList) {
          gameInList.backupCount = backups.value.length;
        }
      }
    } else {
      console.error('加载备份失败', res.message);
      showMessage('无法加载备份列表', 'error');
    }
  });

  // 备份结果
  ipc.on(`backup-save-reply@${PLUGIN_ID}`, (res) => {
    backupLoading.value = false;
    if (res.success) {
      showMessage('备份创建成功');
      // 刷新备份列表
      if (selectedGame.value) {
        loadBackups(selectedGame.value.appid);
      }
      // 刷新游戏列表（主要是为了更新数量，但直接 update list 更快，这里也可以重新 scan）
      // 简单起见，我们假设 loadBackups 的回调里会更新数量
    } else {
      showMessage(res.message || '备份失败', 'error');
    }
  });

  // 还原结果
  ipc.on(`restore-save-reply@${PLUGIN_ID}`, (res) => {
    restoreLoading.value = null;
    if (res.success) {
      showMessage('还原成功');
    } else {
      showMessage(res.message || '还原失败', 'error');
    }
  });

  // 删除结果
  ipc.on(`delete-backup-reply@${PLUGIN_ID}`, (res) => {
    deleteLoading.value = null;
    if (res.success) {
      showMessage('备份已删除');
      if (selectedGame.value) {
        loadBackups(selectedGame.value.appid);
      }
    } else {
      showMessage(res.message || '删除失败', 'error');
    }
  });
};

// 扫描游戏
const scanGames = () => {
  loading.value = true;
  ipc.send(`scan-games@${PLUGIN_ID}`);
};

// 打开游戏详情
const openGameDetails = (game) => {
  selectedGame.value = game;
  backups.value = []; // 清空之前的
  dialog.value.show = true;
  loadBackups(game.appid);
};

// 备份游戏
const backupGame = () => {
  if (!selectedGame.value || !canBackup.value) {
    return;
  }

  const savePathInfos = selectedGame.value.savePaths;
  const validPaths = savePathInfos
    .filter((info) => info.absolutePath)
    .map((info) => ({
      root: info.root,
      relativePath: info.relativePath,
      absolutePath: info.absolutePath,
      files: info.files,
    }));

  if (validPaths.length === 0) {
    showMessage('未找到有效的存档路径', 'error');
    return;
  }

  backupLoading.value = true;
  ipc.send(`backup-save@${PLUGIN_ID}`, toRaw({
    gameId: selectedGame.value.appid,
    gameName: selectedGame.value.name,
    savePaths: JSON.parse(JSON.stringify(validPaths)),
  }));
};

// 还原备份
const restoreBackup = (backup) => {
  // eslint-disable-next-line no-alert
  if (!window.confirm(`确定要还原 ${formatTime(backup.backupTime)} 的备份吗？当前存档将被覆盖。`)) {
    return;
  }

  restoreLoading.value = backup.id;
  ipc.send(`restore-save@${PLUGIN_ID}`, backup.path);
};

// 删除备份
const deleteAppBackup = (backup) => {
  // eslint-disable-next-line no-alert
  if (!window.confirm(`确定要删除 ${formatTime(backup.backupTime)} 的备份吗？此操作不可逆。`)) {
    return;
  }

  deleteLoading.value = backup.id;
  ipc.send(`delete-backup@${PLUGIN_ID}`, backup.path);
};

onMounted(() => {
  setupIpcListeners();
  scanGames();
});
</script>

<style scoped>
/* 隐藏滚动条但允许滚动 */
.overflow-y-auto::-webkit-scrollbar {
  width: 8px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}
</style>
