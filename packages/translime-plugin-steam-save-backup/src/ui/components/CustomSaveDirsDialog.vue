<template>
  <!-- mat-dialog 内容被 Teleport 到宿主 @scope 隔离范围之外，样式必须内联 -->
  <mat-dialog
    v-model="visible"
    width="560px"
    close-on-back
    title="自定义存档目录"
  >
    <div style="display: flex; flex-direction: column; gap: 16px; padding-bottom: 4px">
      <mat-text-field
        v-model="gameName"
        style="width: 100%"
        label="游戏名称"
        placeholder="例如：艾尔登法环"
        variant="outlined"
        color="primary"
        :max-length="80"
      />

      <mat-text-field
        v-model="newDir"
        style="width: 100%"
        label="存档目录"
        placeholder="选择要备份的目录"
        variant="outlined"
        color="primary"
        readonly
        @click="pickDir"
      >
        <template #trailing>
          <mat-btn
            icon="folder_open"
            variant="standard"
            size="small"
            aria-label="选择目录"
            @click.stop="pickDir"
          />
        </template>
      </mat-text-field>

      <div
        v-if="formError"
        role="alert"
        style="font-size: .875rem; color: var(--mat-sys-color-error)"
      >
        {{ formError }}
      </div>
    </div>

    <template v-if="customDirs.length > 0">
      <mat-divider style="margin-block: 8px" />

      <div style="margin: 8px 0; font-size: .875rem; font-weight: 500; color: var(--mat-sys-color-on-surface-variant)">
        已添加的自定义目录
      </div>

      <!-- 单一列表：条目与移除确认同为列表项，相邻项自动收窄圆角；
           常规模式下条目正文可自由排版，删除按钮与确认按钮直接放在项内 -->
      <!-- 列表末尾按钮的形变层会向下溢出几像素，末尾留白避免滚动区出现细微滚动条 -->
      <mat-list
        interaction="none"
        style="padding-bottom: 8px"
      >
        <template
          v-for="entry in customDirs"
          :key="`${entry.gameName}:${entry.dir}`"
        >
          <mat-list-item>
            <span style="word-break: break-all">
              {{ entry.gameName }}
            </span>

            <template #supporting>
              <span style="word-break: break-all; color: var(--mat-sys-color-on-surface-variant); font-size: .75rem">
                {{ entry.dir }}
              </span>
            </template>

            <template #trailing>
              <mat-tooltip
                content="移除该目录"
                location="top"
              >
                <template #activator>
                  <mat-btn
                    icon="delete"
                    variant="standard"
                    color="error"
                    size="small"
                    :disabled="removingKey !== null"
                    :aria-label="`移除目录 ${entry.dir}`"
                    @click="startRemove(entry)"
                  />
                </template>
              </mat-tooltip>
            </template>
          </mat-list-item>

          <!-- 移除确认项：可选清理本地备份与远端备份（远端写删除标记） -->
          <mat-list-item
            v-if="removingKey === removeKeyOf(entry)"
            data-remove-panel
          >
            <div style="font-weight: 500; color: var(--mat-sys-color-error)">
              移除后不再自动备份该目录。
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px 24px; margin-top: 8px">
              <mat-switch v-model="removeDeleteBackups">
                删除本地备份
              </mat-switch>
              <mat-switch v-model="removeDeleteRemote">
                同时删除远程存档
              </mat-switch>
            </div>
            <div style="margin-top: 4px; font-size: .75rem; color: var(--mat-sys-color-on-surface-variant)">
              远端存档写入删除标记后，其他设备同步时自动跟随删除。
            </div>
            <div style="display: flex; gap: 8px; margin-top: 12px">
              <mat-btn
                variant="filled"
                color="error"
                :loading="removing"
                @click="confirmRemove(entry)"
              >
                确认移除
              </mat-btn>
              <mat-btn
                variant="text"
                :disabled="removing"
                @click="cancelRemove"
              >
                取消
              </mat-btn>
            </div>
          </mat-list-item>
        </template>
      </mat-list>
    </template>

    <template #actions>
      <mat-spacer />

      <mat-btn
        variant="text"
        @click="visible = false"
      >
        关闭
      </mat-btn>

      <mat-btn
        variant="filled"
        color="primary"
        prefix="add"
        :disabled="!canAdd"
        :loading="adding"
        @click="addDir"
      >
        添加
      </mat-btn>
    </template>
  </mat-dialog>
</template>

<script setup>
import {
  computed,
  nextTick,
  ref,
  watch,
} from 'vue';
import {
  getPluginSetting,
  useDialog,
  useIpc,
  useLogger,
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
const baseLogger = useLogger();
const logger = baseLogger.child ? baseLogger.child({ plugin_id: PLUGIN_ID, context: 'CustomSaveDirsDialog' }) : baseLogger;

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const gameName = ref('');
const newDir = ref('');
const formError = ref('');
const adding = ref(false);
const customDirs = ref([]);

const canAdd = computed(() => Boolean(gameName.value.trim() && newDir.value) && !adding.value);

const loadCustomDirs = async () => {
  try {
    const settings = await getPluginSetting(PLUGIN_ID);
    const list = settings?.customSaveDirs;
    customDirs.value = Array.isArray(list) ? list : [];
  } catch (err) {
    logger.error('读取自定义存档目录失败:', err);
    customDirs.value = [];
  }
};

watch(visible, (open) => {
  if (open) {
    formError.value = '';
    loadCustomDirs();
  } else {
    removingKey.value = null;
  }
});

const pickDir = async () => {
  const dialog = useDialog();
  if (!dialog) {
    return;
  }
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'dontAddToRecent'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    [newDir.value] = result.filePaths;
    formError.value = '';
  }
};

const addDir = async () => {
  if (!canAdd.value) {
    return;
  }

  adding.value = true;
  formError.value = '';
  try {
    const res = await ipc.invoke(`add-custom-save-dir@${PLUGIN_ID}`, {
      gameName: gameName.value.trim(),
      dir: newDir.value,
    });
    if (res.success) {
      customDirs.value = res.customDirs || [];
      gameName.value = '';
      newDir.value = '';
      emit('changed');
    } else {
      formError.value = res.message || '添加失败';
    }
  } catch (err) {
    formError.value = err.message || '添加失败';
  } finally {
    adding.value = false;
  }
};

// ===== 移除确认流：点删除图标展开选项（删本地备份 / 删远程），确认后才执行 =====
const removeKeyOf = (entry) => `${entry.gameName}:${entry.dir}`;
const removingKey = ref(null);
const removing = ref(false);
const removeDeleteBackups = ref(false);
const removeDeleteRemote = ref(false);

const startRemove = async (entry) => {
  formError.value = '';
  const key = removeKeyOf(entry);
  // 再次点击同一目录收起面板
  if (removingKey.value === key) {
    removingKey.value = null;
    return;
  }
  removeDeleteBackups.value = false;
  removeDeleteRemote.value = false;
  removingKey.value = key;
  // 列表较长时确认面板可能展开在视口外：滚动到可见位置
  await nextTick();
  document.querySelector('[data-remove-panel]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
};

const cancelRemove = () => {
  removingKey.value = null;
};

const confirmRemove = async (entry) => {
  removing.value = true;
  formError.value = '';
  try {
    const res = await ipc.invoke(`remove-custom-save-dir@${PLUGIN_ID}`, {
      gameName: entry.gameName,
      dir: entry.dir,
      deleteBackups: removeDeleteBackups.value,
      deleteRemote: removeDeleteRemote.value,
    });
    if (res.success) {
      customDirs.value = res.customDirs || [];
      removingKey.value = null;
      emit('changed');
      const messages = [];
      if (res.removedBackups > 0) {
        messages.push(`已删除 ${res.removedBackups} 份本地备份`);
      }
      if (res.remoteDeleted) {
        messages.push('远端备份已写入删除标记');
      }
      if (Array.isArray(res.warnings) && res.warnings.length > 0) {
        formError.value = messages.concat(res.warnings).join('；');
      } else if (messages.length > 0) {
        formError.value = '';
        logger.info(messages.join('；'));
      }
    } else {
      formError.value = res.message || '移除失败';
    }
  } catch (err) {
    formError.value = err.message || '移除失败';
  } finally {
    removing.value = false;
  }
};
</script>
