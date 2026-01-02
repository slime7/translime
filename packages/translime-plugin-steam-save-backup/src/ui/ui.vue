<template>
  <v-container
    fluid
    class="fill-height pa-4 align-start"
  >
    <!-- 顶部工具栏 -->
    <v-toolbar
      density="compact"
      color="transparent"
      class="mb-4"
    >
      <v-toolbar-title class="text-h5 font-weight-bold text-primary">
        Steam 存档备份
      </v-toolbar-title>
      <v-spacer />
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
      <v-col
        cols="12"
        class="text-center mt-10"
      >
        <v-progress-circular
          indeterminate
          color="primary"
          size="64"
        />
        <div class="mt-4 text-grey">
          正在扫描 Steam 游戏...
        </div>
      </v-col>
    </v-row>

    <!-- 正常显示的游戏列表 -->
    <v-row v-if="visibleGames.length > 0">
      <v-col
        v-for="game in visibleGames"
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
            <v-avatar
              color="primary"
              size="56"
            >
              <span class="text-h5 font-weight-bold text-white">
                {{ game.name.charAt(0).toUpperCase() }}
              </span>
            </v-avatar>
            <div class="ml-4 overflow-hidden flex-grow-1">
              <v-tooltip
                :text="game.name"
                location="top"
              >
                <template #activator="{ props }">
                  <div
                    v-bind="props"
                    class="text-h6 text-truncate font-weight-medium"
                  >
                    {{ game.name }}
                  </div>
                </template>
              </v-tooltip>
              <div class="text-caption text-grey-darken-1">
                APP ID: {{ game.appid }}
              </div>
            </div>
            <v-tooltip
              text="隐藏此游戏"
              location="top"
            >
              <template #activator="{ props }">
                <v-btn
                  v-bind="props"
                  icon="visibility_off"
                  variant="text"
                  size="small"
                  color="grey"
                  @click.stop="excludeGame(game)"
                  :loading="excludeLoading === game.appid"
                />
              </template>
            </v-tooltip>
          </div>

          <v-divider />

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
              <v-icon
                color="grey-lighten-1"
                icon="chevron_right"
              />
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- 已隐藏的游戏 (默认折叠) -->
    <v-row
      v-if="hiddenGames.length > 0"
      class="mt-8"
    >
      <v-col cols="12">
        <v-expansion-panels variant="accordion">
          <v-expansion-panel
            elevation="0"
            class="bg-transparent"
          >
            <v-expansion-panel-title class="text-subtitle-1 text-grey font-weight-bold">
              <v-icon
                icon="visibility_off"
                class="mr-2"
              />
              已隐藏的游戏 ({{ hiddenGames.length }} 个)
            </v-expansion-panel-title>
            <v-expansion-panel-text class="pa-0">
              <v-row class="mt-2">
                <v-col
                  v-for="game in hiddenGames"
                  :key="game.appid"
                  cols="12"
                  sm="6"
                  md="4"
                  lg="3"
                  xl="2"
                >
                  <v-card
                    class="mx-auto fill-height d-flex flex-column"
                    variant="outlined"
                    density="compact"
                    style="opacity: 0.7"
                  >
                    <div class="d-flex flex-row align-center pa-3">
                      <v-avatar
                        color="grey-lighten-2"
                        size="40"
                      >
                        <span class="text-subtitle-1 font-weight-bold text-grey">
                          {{ game.name.charAt(0).toUpperCase() }}
                        </span>
                      </v-avatar>
                      <div class="ml-3 overflow-hidden flex-grow-1">
                        <div class="text-subtitle-2 text-truncate font-weight-medium text-grey-darken-1">
                          {{ game.name }}
                        </div>
                      </div>
                      <v-tooltip
                        text="恢复显示"
                        location="top"
                      >
                        <template #activator="{ props }">
                          <v-btn
                            v-bind="props"
                            icon="visibility"
                            variant="text"
                            size="x-small"
                            color="primary"
                            @click="includeGame(game)"
                            :loading="excludeLoading === game.appid"
                          />
                        </template>
                      </v-tooltip>
                    </div>
                  </v-card>
                </v-col>
              </v-row>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-col>
    </v-row>

    <div
      v-if="!loading && visibleGames.length === 0 && hiddenGames.length === 0"
      class="d-flex flex-column align-center justify-center fill-height w-100 mt-10"
    >
      <v-icon
        size="80"
        color="grey-lighten-2"
      >
        sports_esports
      </v-icon>
      <div class="text-h6 text-grey mt-4">
        未发现 Steam 游戏
      </div>
      <div class="text-caption text-grey mt-1">
        请尝试在插件设置中手动配置 Steam 路径
      </div>
      <v-btn
        class="mt-4"
        color="primary"
        variant="text"
        @click="scanGames"
      >
        重新扫描
      </v-btn>
    </div>

    <!-- 备份详情模态框 -->
    <v-dialog
      v-model="dialog.show"
      max-width="800px"
      scrollable
      transition="dialog-bottom-transition"
    >
      <v-card
        v-if="selectedGame"
        class="rounded-lg"
        height="80vh"
      >
        <v-toolbar
          color="primary"
          density="compact"
          class="flex-grow-0"
        >
          <v-toolbar-title>({{ selectedGame.appid }}){{ selectedGame.name }} - 备份管理</v-toolbar-title>

          <template #append>
            <div class="d-flex ga-1">
              <v-btn
                icon
                @click="dialog.show = false"
              >
                <v-icon>close</v-icon>
              </v-btn>
            </div>
          </template>
        </v-toolbar>

        <v-card-text class="pa-0 flex-grow-1 overflow-y-auto">
          <!-- 存档路径显示 (默认折叠) -->
          <v-expansion-panels
            v-if="selectedGame?.savePaths?.length"
            variant="accordion"
            class="mb-2"
          >
            <v-expansion-panel elevation="0">
              <v-expansion-panel-title class="text-subtitle-2 text-grey-darken-1">
                <v-icon
                  icon="folder_open"
                  size="small"
                  class="mr-2"
                />
                检测到存档路径 ({{ selectedGame.savePaths.length }} 个)
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <div
                  v-for="(pathInfo, index) in selectedGame.savePaths"
                  :key="index"
                  class="text-caption mb-4 text-break-all"
                >
                  <div class="font-weight-bold mb-1 d-flex align-center">
                    <v-chip
                      size="x-small"
                      label
                      class="mr-2"
                      color="primary"
                      variant="tonal"
                    >
                      路径 {{ index + 1 }}
                    </v-chip>
                    <span class="text-grey-darken-3">{{ pathInfo.absolutePath || '未探测到有效路径' }}</span>
                  </div>
                  <div class="ml-4 pl-3 border-s border-opacity-25">
                    <div
                      v-for="file in pathInfo.files"
                      :key="file"
                      class="text-grey-darken-1 d-flex align-center py-0.5"
                    >
                      <v-icon
                        icon="description"
                        size="14"
                        class="mr-1 text-grey-lighten-1"
                      />
                      {{ file }}
                    </div>
                  </div>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>

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
          <div
            v-if="backups.length > 0"
            class="pa-4"
          >
            <v-card
              v-for="backup in backups"
              :key="backup.id"
              class="mb-3"
              elevation="1"
              border
            >
              <v-list-item class="pa-3">
                <template #prepend>
                  <v-avatar
                    color="blue-lighten-5"
                    icon="save"
                    color-icon="primary"
                  />
                </template>

                <v-list-item-title class="font-weight-bold">
                  {{ formatTime(backup.backupTime) }}
                </v-list-item-title>
                <v-list-item-subtitle
                  v-if="backup.note"
                  class="mt-1 text-primary text-caption font-italic"
                >
                  “{{ backup.note }}”
                </v-list-item-subtitle>

                <template #append>
                  <div class="d-flex align-center gap-2">
                    <v-tooltip
                      text="还原此备份"
                      location="top"
                    >
                      <template #activator="{ props }">
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

                    <v-tooltip
                      text="备注"
                      location="top"
                    >
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          variant="text"
                          color="grey"
                          icon="edit_note"
                          size="small"
                          @click="openNoteDialog(backup)"
                        />
                      </template>
                    </v-tooltip>

                    <v-tooltip
                      text="删除备份"
                      location="top"
                    >
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          variant="text"
                          color="error"
                          icon="delete"
                          size="small"
                          @click="deleteAppBackup(backup)"
                          :loading="deleteLoading === backup.id"
                        />
                      </template>
                    </v-tooltip>
                  </div>
                </template>
              </v-list-item>
            </v-card>
          </div>

          <!-- 空状态 -->
          <div
            v-else
            class="d-flex flex-column align-center justify-center fill-height py-10 text-grey"
          >
            <v-icon
              size="64"
              color="grey-lighten-2"
            >
              inventory_2
            </v-icon>
            <div class="mt-2">
              暂无备份记录
            </div>
          </div>
        </v-card-text>

        <v-divider />

        <v-card-actions class="pa-4">
          <v-spacer />
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

    <!-- 备注编辑对话框 -->
    <v-dialog
      v-model="noteDialog.show"
      max-width="400px"
    >
      <v-card class="rounded-lg">
        <v-toolbar
          color="primary"
          density="compact"
        >
          <v-toolbar-title>编辑备注</v-toolbar-title>
          <v-spacer />
          <v-btn
            icon
            @click="noteDialog.show = false"
          >
            <v-icon>close</v-icon>
          </v-btn>
        </v-toolbar>
        <v-card-text class="pa-4">
          <v-text-field
            v-model="noteDialog.note"
            label="备份说明"
            placeholder="例如：打BOSS前、某个结局等"
            counter="80"
            maxlength="80"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            autofocus
            @keyup.enter="saveNote"
          />
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn
            variant="text"
            @click="noteDialog.show = false"
          >
            取消
          </v-btn>
          <v-btn
            color="primary"
            variant="elevated"
            @click="saveNote"
            :loading="noteDialog.loading"
          >
            保存
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import {
  computed,
  onMounted,
  ref,
  toRaw,
} from 'vue';

// 从全局对象获取 Vuetify 组件
// 注意：实际运行时环境中已有 Vuetify 全局变量，这里解构仅作参考或 IDE 提示
// 如果是 ESM 构建，通常不需要这样手动解构，但为了兼容原有代码风格保持一致
const {
  VContainer,
  VRow,
  VCol,
  VToolbar,
  VToolbarTitle,
  VSpacer,
  VBtn,
  VIcon,
  VListItem,
  VAvatar,
  VListItemTitle,
  VListItemSubtitle,
  VAlert,
  VCard,
  VCardActions,
  VCardText,
  VTextField,
  VSnackbar,
  VDialog,
  VProgressCircular,
  VDivider,
  VChip,
  VTooltip,
  VExpansionPanels,
  VExpansionPanel,
  VExpansionPanelTitle,
  VExpansionPanelText,
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
const excludeLoading = ref(null); // 存储正在隐藏的游戏 ID
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

// 计算属性
const visibleGames = computed(() => games.value.filter((g) => !g.excluded));
const hiddenGames = computed(() => games.value.filter((g) => g.excluded));
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

  // 隐藏游戏结果
  ipc.on(`exclude-game-reply@${PLUGIN_ID}`, (res) => {
    excludeLoading.value = null;
    if (res.success) {
      showMessage('游戏已隐藏');
      const game = games.value.find((g) => String(g.appid) === res.appid);
      if (game) {
        game.excluded = true;
      }
    } else {
      showMessage(res.message || '隐藏失败', 'error');
    }
  });

  // 恢复显示游戏结果
  ipc.on(`include-game-reply@${PLUGIN_ID}`, (res) => {
    excludeLoading.value = null;
    if (res.success) {
      showMessage('游戏已恢复显示');
      const game = games.value.find((g) => String(g.appid) === res.appid);
      if (game) {
        game.excluded = false;
      }
    } else {
      showMessage(res.message || '恢复失败', 'error');
    }
  });

  // 更新备注结果
  ipc.on(`update-backup-note-reply@${PLUGIN_ID}`, (res) => {
    noteDialog.value.loading = false;
    if (res.success) {
      showMessage('备注已更新');
      noteDialog.value.show = false;
      // 更新本地备份列表中的数据
      if (noteDialog.value.backup) {
        noteDialog.value.backup.note = res.note;
      }
    } else {
      showMessage(res.message || '更新备注失败', 'error');
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
  ipc.send(
    `backup-save@${PLUGIN_ID}`,
    toRaw({
      gameId: selectedGame.value.appid,
      gameName: selectedGame.value.name,
      savePaths: JSON.parse(JSON.stringify(validPaths)),
    }),
  );
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

// 隐藏游戏
const excludeGame = (game) => {
  // eslint-disable-next-line no-alert
  if (!window.confirm(`确定要隐藏游戏 "${game.name}" 吗？隐藏后可在下方“已隐藏的游戏”中恢复。`)) {
    return;
  }

  excludeLoading.value = game.appid;
  ipc.send(`exclude-game@${PLUGIN_ID}`, game.appid);
};

// 恢复显示游戏
const includeGame = (game) => {
  excludeLoading.value = game.appid;
  ipc.send(`include-game@${PLUGIN_ID}`, game.appid);
};

// 打开备注对话框
const openNoteDialog = (backup) => {
  noteDialog.value.backup = backup;
  noteDialog.value.note = backup.note || '';
  noteDialog.value.show = true;
};

// 保存备注
const saveNote = () => {
  if (!noteDialog.value.backup) return;

  noteDialog.value.loading = true;
  ipc.send(`update-backup-note@${PLUGIN_ID}`, {
    backupPath: noteDialog.value.backup.path,
    note: noteDialog.value.note,
  });
};

onMounted(() => {
  setupIpcListeners();
  scanGames();
});
</script>

<style scoped lang="scss">
/* 隐藏滚动条但允许滚动 */
.overflow-y-auto::-webkit-scrollbar {
  width: 8px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, .2);
  border-radius: 4px;
}

.text-break-all {
  word-break: break-all;
}
</style>
