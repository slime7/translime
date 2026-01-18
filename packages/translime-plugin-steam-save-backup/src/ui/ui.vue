<template>
  <v-container
    fluid
    class="h-full p-4"
  >
    <!-- 顶部工具栏 -->
    <v-toolbar
      density="compact"
      color="transparent"
      class="mb-4"
    >
      <v-toolbar-title class="text-2xl font-bold text-primary">
        Steam 存档备份
      </v-toolbar-title>
      <v-spacer />
      <v-btn
        prepend-icon="folder_open"
        variant="tonal"
        color="secondary"
        class="mr-2"
        @click="openBackupDir"
        :loading="loading.openDir"
      >
        打开备份目录
      </v-btn>
      <v-btn
        prepend-icon="refresh"
        variant="tonal"
        color="primary"
        @click="scanGames"
        :loading="loading.scan"
      >
        刷新列表
      </v-btn>
    </v-toolbar>

    <!-- 游戏列表 (卡片网格) -->
    <v-row v-if="loading.scan && games.length === 0">
      <v-col
        cols="12"
        class="text-center mt-10"
      >
        <v-progress-circular
          indeterminate
          color="primary"
          size="64"
        />
        <div class="mt-4 text-[rgb(var(--v-theme-on-surface-variant))]">
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
          class="rounded-2xl"
          rounded
          @click="openGameDetails(game)"
          hover
        >
          <div class="mx-auto h-full flex flex-col">
            <div class="flex flex-row items-center p-4">
              <v-avatar
                color="primary"
                size="56"
              >
                <span
                  class="text-2xl font-bold text-[rgb(var(--v-theme-on-primary))]"
                >
                  {{ game.name.charAt(0).toUpperCase() }}
                </span>
              </v-avatar>

              <div class="ml-4 truncate grow-1">
                <v-tooltip
                  :text="game.name"
                  location="top"
                >
                  <template #activator="{ props }">
                    <div
                      v-bind="props"
                      class="text-xl truncate font-medium"
                    >
                      {{ game.name }}
                    </div>
                  </template>
                </v-tooltip>

                <div
                  class="text-[rgb(var(--v-theme-on-surface-variant))]"
                >
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
                    color="on-surface-variant"
                    @click.stop="excludeGame(game)"
                    :loading="loading.exclude === game.appid"
                  />
                </template>
              </v-tooltip>
            </div>

            <v-divider />
          </div>

          <v-card-text>
            <div class="py-2">
              <div class="flex justify-between items-center">
                <v-chip
                  size="small"
                  :color="game.backupCount > 0 ? 'tertiary' : 'surface-container-highest'"
                  variant="flat"
                  class="font-medium"
                >
                  {{ game.backupCount || 0 }} 个备份
                </v-chip>
                <v-icon
                  color="outline"
                  icon="chevron_right"
                />
              </div>
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
            <v-expansion-panel-title class="text-subtitle-1 text-[rgb(var(--v-theme-on-surface))] font-bold">
              <v-icon
                icon="visibility_off"
                class="mr-2"
              />
              已隐藏的游戏 ({{ hiddenGames.length }} 个)
            </v-expansion-panel-title>

            <v-expansion-panel-text class="p-0">
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

                    variant="outlined"
                    density="compact"
                    style="opacity: .7"
                  >
                    <v-card-text>
                      <div class="flex items-center">
                        <v-avatar
                          color="surface-container-highest"
                          size="40"
                        >
                          <span class="text-subtitle-1 font-bold">
                            {{ game.name.charAt(0).toUpperCase() }}
                          </span>
                        </v-avatar>

                        <div class="mx-2 overflow-hidden grow">
                          <div class="text-subtitle-2 truncate font-medium text-[rgb(var(--v-theme-on-surface-variant))]">
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
                              color="surface-container-highest"
                              @click="includeGame(game)"
                              :loading="loading.exclude === game.appid"
                            />
                          </template>
                        </v-tooltip>
                      </div>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-col>
    </v-row>

    <div
      v-if="!loading.scan && visibleGames.length === 0 && hiddenGames.length === 0"
      class="flex flex-col items-center justify-center h-full w-full mt-10"
    >
      <v-icon
        size="80"
        color="outline-variant"
      >
        sports_esports
      </v-icon>
      <div class="text-xl text-[rgb(var(--v-theme-on-surface-variant))] mt-4">
        未发现 Steam 游戏
      </div>
      <div class="text-sm text-[rgb(var(--v-theme-outline))] mt-1">
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
        class="rounded-2xl"
        rounded
        height="80vh"
      >
        <v-toolbar
          color="primary"
          density="compact"
          class="grow-0"
        >
          <v-toolbar-title>({{ selectedGame.appid }}){{ selectedGame.name }} - 备份管理</v-toolbar-title>

          <template #append>
            <div class="flex gap-1">
              <v-btn
                icon
                @click="dialog.show = false"
              >
                <v-icon>close</v-icon>
              </v-btn>
            </div>
          </template>
        </v-toolbar>

        <v-card-text class="p-0 grow-1 overflow-y-auto">
          <!-- 存档路径显示 (默认折叠) -->
          <v-expansion-panels
            v-if="selectedGame?.savePaths?.length"
            variant="accordion"
            class="mb-2"
          >
            <v-expansion-panel elevation="0">
              <v-expansion-panel-title class="text-subtitle-2 text-[rgb(var(--v-theme-on-surface-variant))]">
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
                  class="text-sm mb-4 break-all"
                >
                  <div class="font-bold mb-1 flex items-center">
                    <v-chip
                      size="x-small"
                      label
                      class="mr-2"
                      color="primary"
                      variant="tonal"
                    >
                      路径 {{ index + 1 }}
                    </v-chip>
                    <span class="text-[rgb(var(--v-theme-on-surface))]">{{ pathInfo.absolutePath || '未探测到有效路径' }}</span>
                  </div>
                  <div class="ml-4 pl-3 border-s border-opacity-25">
                    <div
                      v-for="file in pathInfo.files"
                      :key="file"
                      class="text-[rgb(var(--v-theme-on-surface-variant))] flex items-center py-0.5"
                    >
                      <v-icon
                        icon="description"
                        size="14"
                        class="mr-1 text-[rgb(var(--v-theme-outline))]"
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
            color="tertiary-container"
            variant="tonal"
            class="m-4"
            icon="warning"
          >
            <span class="text-[rgb(var(--v-theme-on-tertiary-container))]">
              无法自动定位该游戏的存档路径，暂不支持备份。
            </span>
          </v-alert>

          <!-- 备份列表 -->
          <div
            v-if="backups.length > 0"
            class="p-4"
          >
            <v-card
              v-for="backup in backups"
              :key="backup.id"
              class="mb-3"
              elevation="1"
              border
            >
              <v-list-item class="p-3">
                <template #prepend>
                  <v-avatar
                    color="secondary-container"
                    icon="save"
                    color-icon="on-secondary-container"
                  />
                </template>

                <v-list-item-title class="font-bold">
                  {{ formatTime(backup.backupTime) }}
                </v-list-item-title>
                <v-list-item-subtitle
                  v-if="backup.note"
                  class="mt-1 text-primary text-sm italic"
                >
                  “{{ backup.note }}”
                </v-list-item-subtitle>

                <template #append>
                  <div class="flex items-center gap-2">
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
                          :loading="loading.restore === backup.id"
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
                          color="on-surface-variant"
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
                          :loading="loading.delete === backup.id"
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
            class="flex flex-col items-center justify-center h-full w-full py-10 text-[rgb(var(--v-theme-on-surface-variant))]"
          >
            <v-icon
              size="64"
              color="outline-variant"
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
            :loading="loading.backup"
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
      <v-card class="rounded-2xl" rounded>
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
        <v-card-text class="p-4">
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
        <v-card-actions class="p-4 pt-0">
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

    <!-- 通用确认对话框 -->
    <v-dialog
      v-model="confirmDialog.show"
      max-width="400px"
      persistent
    >
      <v-card class="rounded-2xl pa-2" rounded>
        <v-card-text class="text-center pt-6">
          <v-avatar
            :color="confirmDialog.color"
            size="64"
            class="mb-4"
            variant="tonal"
          >
            <v-icon
              :icon="confirmDialog.icon"
              size="32"
            />
          </v-avatar>
          <div class="text-xl font-bold mb-2">
            {{ confirmDialog.title }}
          </div>
          <div class="text-body-2 text-[rgb(var(--v-theme-on-surface-variant))] mb-4">
            {{ confirmDialog.message }}
            <div
              v-if="confirmDialog.detail"
              class="mt-1 italic font-medium"
            >
              {{ confirmDialog.detail }}
            </div>
          </div>
        </v-card-text>
        <v-card-actions class="p-4 pt-0">
          <v-spacer />
          <v-btn
            variant="text"
            color="grey"
            @click="confirmDialog.show = false"
            :disabled="confirmDialog.loading"
          >
            取消
          </v-btn>
          <v-btn
            :color="confirmDialog.color"
            variant="elevated"
            @click="handleConfirm"
            :loading="confirmDialog.loading"
          >
            {{ confirmDialog.confirmText }}
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
const loading = ref({
  scan: false,
  openDir: false,
  backup: false,
  restore: null, // 存储正在还原的备份 ID
  delete: null, // 存储正在删除的备份 ID
  exclude: null, // 存储正在隐藏的游戏 ID
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
const loadBackups = async (gameId) => {
  try {
    const res = await ipc.invoke(`get-backups@${PLUGIN_ID}`, gameId);
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
  } catch (err) {
    console.error('加载备份失败', err);
    showMessage('无法加载备份列表', 'error');
  }
};

// 打开备份目录
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

// 扫描游戏
const scanGames = async () => {
  loading.value.scan = true;
  try {
    const res = await ipc.invoke(`scan-games@${PLUGIN_ID}`);
    if (res.success) {
      games.value = res.games || [];
      // 如果当前正在查看某个游戏详情，更新其备份数显示等
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
  } catch (err) {
    showMessage(err.message || '扫描失败', 'error');
  } finally {
    loading.value.scan = false;
  }
};

// 打开游戏详情
const openGameDetails = (game) => {
  selectedGame.value = game;
  backups.value = []; // 清空之前的
  dialog.value.show = true;
  loadBackups(game.appid);
};

// 备份游戏
const backupGame = async () => {
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

  loading.value.backup = true;
  try {
    const res = await ipc.invoke(
      `backup-save@${PLUGIN_ID}`,
      toRaw({
        gameId: selectedGame.value.appid,
        gameName: selectedGame.value.name,
        savePaths: JSON.parse(JSON.stringify(validPaths)),
      }),
    );
    if (res.success) {
      showMessage('备份创建成功');
      // 刷新备份列表
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

// 通用确认处理
const handleConfirm = async () => {
  if (confirmDialog.value.onConfirm) {
    confirmDialog.value.loading = true;
    try {
      await confirmDialog.value.onConfirm();
    } finally {
      confirmDialog.value.loading = false;
      confirmDialog.value.show = false;
    }
  }
};

// 还原备份
const restoreBackup = (backup) => {
  confirmDialog.value = {
    show: true,
    title: '还原备份',
    icon: 'settings_backup_restore',
    color: 'primary',
    message: `确定要还原 ${formatTime(backup.backupTime)} 的备份吗？`,
    detail: '当前存档将被覆盖。',
    confirmText: '立刻还原',
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

// 删除备份
const deleteAppBackup = (backup) => {
  confirmDialog.value = {
    show: true,
    title: '删除备份',
    icon: 'delete',
    color: 'error',
    message: `确定要删除 ${formatTime(backup.backupTime)} 的备份吗？`,
    detail: '此操作不可逆。',
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

// 隐藏游戏
const excludeGame = (game) => {
  confirmDialog.value = {
    show: true,
    title: '隐藏游戏',
    icon: 'visibility_off',
    color: 'warning',
    message: `确定要隐藏游戏 "${game.name}" 吗？`,
    detail: '隐藏后可在下方"已隐藏的游戏"中恢复。',
    confirmText: '确认隐藏',
    onConfirm: async () => {
      loading.value.exclude = game.appid;
      try {
        const res = await ipc.invoke(`exclude-game@${PLUGIN_ID}`, game.appid);
        if (res.success) {
          showMessage('游戏已隐藏');
          const gameItem = games.value.find((g) => String(g.appid) === res.appid);
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

// 恢复显示游戏
const includeGame = async (game) => {
  loading.value.exclude = game.appid;
  try {
    const res = await ipc.invoke(`include-game@${PLUGIN_ID}`, game.appid);
    if (res.success) {
      showMessage('游戏已恢复显示');
      const gameItem = games.value.find((g) => String(g.appid) === res.appid);
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

// 打开备注对话框
const openNoteDialog = (backup) => {
  noteDialog.value.backup = backup;
  noteDialog.value.note = backup.note || '';
  noteDialog.value.show = true;
};

// 保存备注
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
      // 更新本地备份列表中的数据
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
</script>

<style>
/* 引入 Tailwind CSS utilities，放入 tailwind 图层以与主程序统一 */
@layer tailwind {
  @layer theme, utilities;
  @import "tailwindcss/theme.css" layer(theme);
  @import "tailwindcss/utilities.css" layer(utilities);
}
</style>

<style scoped lang="scss">
/* 隐藏滚动条但允许滚动 */
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
