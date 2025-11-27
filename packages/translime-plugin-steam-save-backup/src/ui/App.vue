<template>
  <v-app>
    <v-main>
      <v-container fluid class="fill-height">
        <v-row class="fill-height">
          <!-- 左侧：游戏列表 -->
          <v-col cols="4" class="border-e fill-height d-flex flex-column pa-0">
            <v-toolbar density="compact" color="primary">
              <v-toolbar-title>Steam 游戏列表</v-toolbar-title>
              <v-spacer></v-spacer>
              <v-btn icon @click="scanGames" :loading="loading">
                <v-icon>refresh</v-icon>
              </v-btn>
            </v-toolbar>

            <v-list class="flex-grow-1 overflow-y-auto" lines="two">
              <v-list-item
                v-for="game in games"
                :key="game.appid"
                :value="game"
                @click="selectGame(game)"
                :active="selectedGame?.appid === game.appid"
                color="primary"
              >
                <template v-slot:prepend>
                  <v-avatar color="grey-lighten-1">
                    <span class="text-h6">{{ game.name.charAt(0).toUpperCase() }}</span>
                  </v-avatar>
                </template>
                <v-list-item-title>{{ game.name }}</v-list-item-title>
                <v-list-item-subtitle>ID: {{ game.appid }}</v-list-item-subtitle>
              </v-list-item>
              
              <v-list-item v-if="games.length === 0 && !loading">
                <v-list-item-title class="text-center text-grey">未发现游戏</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-col>

          <!-- 右侧：备份详情 -->
          <v-col cols="8" class="fill-height d-flex flex-column pa-0 bg-grey-lighten-5">
            <template v-if="selectedGame">
              <v-toolbar density="compact" color="white" elevation="1">
                <v-toolbar-title>{{ selectedGame.name }}</v-toolbar-title>
                <v-spacer></v-spacer>
                <v-btn 
                  color="success" 
                  prepend-icon="cloud_upload"
                  @click="backupGame"
                  :loading="backupLoading"
                  :disabled="!canBackup"
                >
                  备份存档
                </v-btn>
              </v-toolbar>

              <div class="pa-4 flex-grow-1 overflow-y-auto">
                <v-alert
                  v-if="!canBackup"
                  type="warning"
                  variant="tonal"
                  class="mb-4"
                >
                  无法自动定位存档路径。
                </v-alert>

                <div v-if="backups.length > 0">
                  <v-card
                    v-for="backup in backups"
                    :key="backup.id"
                    class="mb-3"
                    elevation="1"
                  >
                    <v-card-item>
                      <v-card-title class="text-subtitle-1">
                        {{ formatTime(backup.backupTime) }}
                      </v-card-title>
                      <v-card-subtitle>
                        {{ backup.originalPath }}
                      </v-card-subtitle>
                    </v-card-item>

                    <v-card-actions>
                      <v-spacer></v-spacer>
                      <v-btn 
                        variant="text" 
                        color="primary"
                        @click="restoreBackup(backup)"
                        :loading="restoreLoading === backup.id"
                      >
                        还原
                      </v-btn>
                    </v-card-actions>
                  </v-card>
                </div>
                <div v-else class="text-center mt-10 text-grey">
                  <v-icon size="64" color="grey-lighten-2">history</v-icon>
                  <div class="mt-2">暂无备份</div>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="d-flex fill-height align-center justify-center text-grey">
                <div>
                  <v-icon size="64" class="mb-2">sports_esports</v-icon>
                  <div>请选择一个游戏查看备份</div>
                </div>
              </div>
            </template>
          </v-col>
        </v-row>
      </v-container>

      <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3000">
        {{ snackbar.text }}
      </v-snackbar>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';

// 从全局对象获取 Vuetify 组件，避免重复打包
const {
  VApp, VMain, VContainer, VRow, VCol,
  VToolbar, VToolbarTitle, VSpacer, VBtn, VIcon,
  VList, VListItem, VAvatar, VListItemTitle, VListItemSubtitle,
  VAlert, VCard, VCardItem, VCardTitle, VCardSubtitle, VCardActions,
  VSnackbar
} = window.vuetify$?.components || {};

// 插件 ID
const PLUGIN_ID = 'translime-plugin-steam-save-backup';

// IPC
const ipc = window.electron.useIpc();

// 状态
const loading = ref(false);
const backupLoading = ref(false);
const restoreLoading = ref(null);
const games = ref([]);
const selectedGame = ref(null);
const backups = ref([]);
const snackbar = ref({ show: false, text: '', color: 'success' });

// 计算属性
const canBackup = computed(() => {
  return selectedGame.value && selectedGame.value.savePaths && selectedGame.value.savePaths.length > 0;
});

// 格式化时间
const formatTime = (isoString) => {
  return new Date(isoString).toLocaleString('zh-CN');
};

// 显示消息
const showMessage = (text, color = 'success') => {
  snackbar.value = { show: true, text, color };
};

// 监听 IPC 回复
const setupIpcListeners = () => {
  // 扫描结果
  ipc.on(`scan-games-reply@${PLUGIN_ID}`, (res) => {
    loading.value = false;
    if (res.success) {
      games.value = res.games || [];
      // 如果当前选中的游戏仍在列表中，更新它
      if (selectedGame.value) {
        const updated = games.value.find(g => g.appid === selectedGame.value.appid);
        if (updated) {
          selectedGame.value = updated;
        } else {
          selectedGame.value = null;
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
    } else {
      console.error('加载备份失败', res.message);
    }
  });

  // 备份结果
  ipc.on(`backup-save-reply@${PLUGIN_ID}`, (res) => {
    backupLoading.value = false;
    if (res.success) {
      showMessage('备份创建成功');
      // 刷新备份列表
      if (selectedGame.value) {
        ipc.send(`get-backups@${PLUGIN_ID}`, selectedGame.value.appid);
      }
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
};

// 扫描游戏
const scanGames = () => {
  loading.value = true;
  ipc.send(`scan-games@${PLUGIN_ID}`);
};

// 选择游戏
const selectGame = (game) => {
  selectedGame.value = game;
  loadBackups(game.appid);
};

// 加载备份列表
const loadBackups = (gameId) => {
  ipc.send(`get-backups@${PLUGIN_ID}`, gameId);
};

// 备份游戏
const backupGame = () => {
  if (!selectedGame.value || !canBackup.value) return;
  
  // 默认使用第一个存档路径
  const savePath = selectedGame.value.savePaths[0];
  
  backupLoading.value = true;
  ipc.send(`backup-save@${PLUGIN_ID}`, {
    gameId: selectedGame.value.appid,
    gameName: selectedGame.value.name,
    savePath
  });
};

// 还原备份
const restoreBackup = (backup) => {
  if (!confirm(`确定要还原 ${formatTime(backup.backupTime)} 的备份吗？当前存档将被覆盖。`)) {
    return;
  }

  restoreLoading.value = backup.id;
  ipc.send(`restore-save@${PLUGIN_ID}`, backup.path);
};

onMounted(() => {
  setupIpcListeners();
  scanGames();
});
</script>

<style scoped>
.v-list-item--active {
  background-color: rgba(var(--v-theme-primary), 0.1);
}
</style>
