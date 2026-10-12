<template>
  <!-- 对话框内容需使用内联样式 -->
  <mat-dialog
    v-model="visible"
    width="560px"
    close-on-back
    title="发现远程数据"
  >
    <!-- 读取中 -->
    <div
      v-if="loading"
      style="display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 0"
    >
      <mat-progress
        variant="circular"
        indeterminate
        :size="48"
        style="display: inline-block"
        aria-label="正在读取远程数据"
      />
      <span style="color: var(--mat-sys-color-on-surface-variant)">正在读取远程数据…</span>
    </div>

    <!-- 读取失败 -->
    <div
      v-else-if="loadError"
      style="display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding: 24px 0"
    >
      <span
        role="alert"
        style="font-size: .875rem; color: var(--mat-sys-color-error); word-break: break-all"
      >
        {{ loadError }}
      </span>
      <mat-btn
        variant="text"
        prefix="refresh"
        @click="loadRemoteGames"
      >
        重试
      </mat-btn>
    </div>

    <!-- 远端没有数据 -->
    <div
      v-else-if="games.length === 0 && passthrough.length === 0"
      style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; padding: 40px 0; color: var(--mat-sys-color-on-surface-variant)"
    >
      <mat-icon
        icon="inventory_2"
        size="64px"
        color="outline-variant"
      />
      <div style="margin-top: 8px">
        远程没有可发现的数据
      </div>
    </div>

    <!-- 存档备份列表 -->
    <template v-else>
      <template v-if="games.length > 0">
        <div style="font-size: .75rem; color: var(--mat-sys-color-on-surface-variant); padding-bottom: 8px">
          共 {{ games.length }} 个游戏。未添加到本地的游戏选择本地存档位置后即可登记，
          通过「立即同步」拉取远程备份。
        </div>

        <mat-list interaction="multi-action">
          <template
            v-for="game in games"
            :key="game.gameId"
          >
            <mat-list-item>
              <span style="font-weight: 500; word-break: break-all">
                {{ game.gameName }}
              </span>

              <template #supporting>
                <span style="word-break: break-all; color: var(--mat-sys-color-on-surface-variant); font-size: .75rem">
                  {{ backupSummary(game) }}
                </span>
              </template>

              <template #trailing>
                <span
                  v-if="game.added"
                  style="display: flex; align-items: center; gap: 4px; flex-shrink: 0; font-size: .75rem; color: var(--mat-sys-color-on-surface-variant)"
                >
                  <mat-icon
                    icon="check_circle"
                    size="18px"
                  />
                  已添加
                </span>
                <mat-btn
                  v-else
                  variant="filled-tonal"
                  color="primary"
                  size="small"
                  prefix="library_add"
                  :disabled="adding"
                  aria-label="添加到本地"
                  @click="toggleAddPanel(game)"
                >
                  添加到本地
                </mat-btn>
              </template>
            </mat-list-item>

            <!-- 游戏登记面板 -->
            <mat-list-item v-if="addingKey === game.gameId">
              <div style="display: flex; flex-direction: column; gap: 8px; width: 100%">
                <div style="font-weight: 500">
                  为「{{ game.gameName }}」添加本地备份设置
                </div>
                <mat-text-field
                  v-model="pendingDir"
                  style="width: 100%"
                  label="本地存档位置"
                  placeholder="选择该游戏在本机的存档目录"
                  variant="outlined"
                  color="primary"
                  readonly
                  @click="pickDirectory('game')"
                >
                  <template #trailing>
                    <mat-btn
                      icon="folder_open"
                      variant="standard"
                      size="small"
                      aria-label="选择本地存档目录"
                      @click.stop="pickDirectory('game')"
                    />
                  </template>
                </mat-text-field>
                <div style="display: flex; gap: 8px">
                  <mat-btn
                    variant="filled"
                    color="primary"
                    :disabled="!pendingDir"
                    :loading="adding"
                    @click="confirmAdd(game)"
                  >
                    确认添加
                  </mat-btn>
                  <mat-btn
                    variant="text"
                    :disabled="adding"
                    @click="cancelAdd"
                  >
                    取消
                  </mat-btn>
                </div>
                <div
                  v-if="addError"
                  role="alert"
                  style="font-size: .875rem; color: var(--mat-sys-color-error); word-break: break-all"
                >
                  {{ addError }}
                </div>
              </div>
            </mat-list-item>
          </template>
        </mat-list>
      </template>

      <!-- 直通云存档列表 -->
      <template v-if="passthrough.length > 0">
        <mat-divider style="margin-block: 16px 12px" />

        <div style="font-size: .9375rem; font-weight: 500; padding-bottom: 4px">
          直通云存档
        </div>
        <div style="font-size: .75rem; color: var(--mat-sys-color-on-surface-variant); padding-bottom: 8px">
          远端直通条目选择本地目录登记后，执行「立即同步」即可镜像拉取到本地（双向同步，不产生备份包）。
        </div>

        <mat-list interaction="multi-action">
          <template
            v-for="entry in passthrough"
            :key="entry.entryId"
          >
            <mat-list-item>
              <span style="font-weight: 500; word-break: break-all">
                {{ entry.name }}
              </span>

              <template #supporting>
                <span style="word-break: break-all; color: var(--mat-sys-color-on-surface-variant); font-size: .75rem">
                  {{ ptSummary(entry) }}
                </span>
              </template>

              <template #trailing>
                <span
                  v-if="entry.added"
                  style="display: flex; align-items: center; gap: 4px; flex-shrink: 0; font-size: .75rem; color: var(--mat-sys-color-on-surface-variant)"
                >
                  <mat-icon
                    icon="check_circle"
                    size="18px"
                  />
                  已添加
                </span>
                <mat-btn
                  v-else
                  variant="filled-tonal"
                  color="primary"
                  size="small"
                  prefix="library_add"
                  :disabled="ptAdding"
                  aria-label="添加到本地"
                  @click="togglePtAddPanel(entry)"
                >
                  添加到本地
                </mat-btn>
              </template>
            </mat-list-item>

            <!-- 直通登记面板 -->
            <mat-list-item v-if="ptAddingKey === entry.entryId">
              <div style="display: flex; flex-direction: column; gap: 8px; width: 100%">
                <div style="font-weight: 500">
                  为「{{ entry.name }}」添加本地直通目录
                </div>
                <mat-text-field
                  v-model="ptPendingDir"
                  style="width: 100%"
                  label="本地存档目录"
                  placeholder="选择（或先新建）用于镜像同步的目录"
                  variant="outlined"
                  color="primary"
                  readonly
                  @click="pickDirectory('passthrough')"
                >
                  <template #trailing>
                    <mat-btn
                      icon="folder_open"
                      variant="standard"
                      size="small"
                      aria-label="选择本地存档目录"
                      @click.stop="pickDirectory('passthrough')"
                    />
                  </template>
                </mat-text-field>
                <div style="display: flex; gap: 8px">
                  <mat-btn
                    variant="filled"
                    color="primary"
                    :disabled="!ptPendingDir"
                    :loading="ptAdding"
                    @click="confirmPtAdd(entry)"
                  >
                    确认添加
                  </mat-btn>
                  <mat-btn
                    variant="text"
                    :disabled="ptAdding"
                    @click="cancelPtAdd"
                  >
                    取消
                  </mat-btn>
                </div>
                <div
                  v-if="ptAddError"
                  role="alert"
                  style="font-size: .875rem; color: var(--mat-sys-color-error); word-break: break-all"
                >
                  {{ ptAddError }}
                </div>
              </div>
            </mat-list-item>
          </template>
        </mat-list>
      </template>

      <div
        v-if="notice"
        role="status"
        style="font-size: .875rem; color: var(--mat-sys-color-primary); word-break: break-all; padding-top: 8px"
      >
        {{ notice }}
      </div>
    </template>

    <template #actions>
      <mat-spacer />

      <mat-btn
        variant="text"
        @click="visible = false"
      >
        关闭
      </mat-btn>
    </template>
  </mat-dialog>
</template>

<script setup>
import {
  computed,
  ref,
  watch,
} from 'vue';
import {
  useDialog,
  useIpc,
} from 'translime-sdk';

const PLUGIN_ID = 'translime-plugin-steam-save-backup';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue', 'changed']);

const ipc = useIpc();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const loading = ref(false);
const loadError = ref('');
const games = ref([]);
const passthrough = ref([]);
// 展开面板 key 与提示信息
const addingKey = ref(null);
const pendingDir = ref('');
const adding = ref(false);
const addError = ref('');
const ptAddingKey = ref(null);
const ptPendingDir = ref('');
const ptAdding = ref(false);
const ptAddError = ref('');
const notice = ref('');

const formatTime = (isoString) => new Date(isoString).toLocaleString('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const backupSummary = (game) => {
  const count = `${game.backupCount} 份备份`;
  return game.latestBackupTime
    ? `${count} · 最新 ${formatTime(game.latestBackupTime)}`
    : `${count} · 时间未知`;
};

const ptSummary = (entry) => (entry.updatedAt
  ? `最近更新 ${formatTime(entry.updatedAt)}`
  : '更新时间未知');

const loadRemoteGames = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await ipc.invoke(`sync-discover-remote@${PLUGIN_ID}`);
    if (res?.success) {
      games.value = res.games || [];
      passthrough.value = res.passthrough || [];
    } else {
      loadError.value = res?.message || '读取远程数据失败';
      games.value = [];
      passthrough.value = [];
    }
  } catch (err) {
    loadError.value = err.message || '读取远程数据失败';
    games.value = [];
    passthrough.value = [];
  } finally {
    loading.value = false;
  }
};

const cancelAdd = () => {
  addingKey.value = null;
  pendingDir.value = '';
  addError.value = '';
};

const toggleAddPanel = (game) => {
  if (addingKey.value === game.gameId) {
    cancelAdd();
    return;
  }
  addError.value = '';
  addingKey.value = game.gameId;
  pendingDir.value = '';
};

const cancelPtAdd = () => {
  ptAddingKey.value = null;
  ptPendingDir.value = '';
  ptAddError.value = '';
};

const togglePtAddPanel = (entry) => {
  if (ptAddingKey.value === entry.entryId) {
    cancelPtAdd();
    return;
  }
  ptAddError.value = '';
  ptAddingKey.value = entry.entryId;
  ptPendingDir.value = '';
};

// 选择本地目录
const pickDirectory = async (section) => {
  const dialog = useDialog();
  if (!dialog) {
    return;
  }
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'dontAddToRecent'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const [dir] = result.filePaths;
    if (section === 'passthrough') {
      ptPendingDir.value = dir;
    } else {
      pendingDir.value = dir;
    }
    addError.value = '';
    ptAddError.value = '';
  }
};

const confirmAdd = async (game) => {
  if (!pendingDir.value || adding.value) {
    return;
  }
  adding.value = true;
  addError.value = '';
  try {
    const res = await ipc.invoke(`add-custom-save-dir@${PLUGIN_ID}`, {
      gameName: game.gameName,
      dir: pendingDir.value,
      allowEmptyDir: true,
    });
    if (res.success) {
      games.value = games.value.map((item) => (item.gameId === game.gameId ? { ...item, added: true } : item));
      cancelAdd();
      notice.value = `已添加「${game.gameName}」，在同步设置中执行「立即同步」即可拉取远程备份。`;
      emit('changed');
    } else {
      addError.value = res.message || '添加失败';
    }
  } catch (err) {
    addError.value = err.message || '添加失败';
  } finally {
    adding.value = false;
  }
};

const confirmPtAdd = async (entry) => {
  if (!ptPendingDir.value || ptAdding.value) {
    return;
  }
  ptAdding.value = true;
  ptAddError.value = '';
  try {
    const res = await ipc.invoke(`passthrough-add@${PLUGIN_ID}`, {
      name: entry.name,
      dir: ptPendingDir.value,
    });
    if (res.success) {
      passthrough.value = passthrough.value.map((item) => (item.entryId === entry.entryId ? { ...item, added: true } : item));
      cancelPtAdd();
      notice.value = `已添加直通存档「${entry.name}」，执行「立即同步」即可从远程拉取到本地。`;
      emit('changed');
    } else {
      ptAddError.value = res.message || '添加失败';
    }
  } catch (err) {
    ptAddError.value = err.message || '添加失败';
  } finally {
    ptAdding.value = false;
  }
};

watch(visible, (open) => {
  if (open) {
    loadRemoteGames();
    return;
  }
  cancelAdd();
  cancelPtAdd();
  notice.value = '';
});
</script>
