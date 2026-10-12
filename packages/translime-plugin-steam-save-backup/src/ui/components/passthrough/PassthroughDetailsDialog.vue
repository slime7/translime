<template>
  <!-- 对话框内容需使用内联样式 -->
  <mat-dialog
    v-model="visible"
    width="800px"
    close-on-back
    :title="dialogTitle"
  >
    <!-- 路径信息 -->
    <div
      v-if="filesLoading"
      role="status"
      style="margin: 0 0 8px; font-size: .8125rem; color: var(--mat-sys-color-on-surface-variant)"
    >
      正在读取本地目录…
    </div>
    <save-paths-panel
      v-else-if="sources.length > 0"
      :game="{ saveSources: sources }"
    >
      <!-- 远端位置 -->
      <template #append>
        <div style="display: flex; align-items: center; margin: 8px 0 4px; font-size: .875rem; word-break: break-all">
          <mat-chip
            variant="assist"
            color="tertiary"
            style="margin-right: 8px"
          >
            远端位置
          </mat-chip>
          <span style="color: var(--mat-sys-color-on-surface)">{{ remoteLocation }}</span>
        </div>
      </template>
    </save-paths-panel>
    <template v-else>
      <div
        v-if="entry.localExists"
        role="status"
        style="margin: 0 0 8px; font-size: .8125rem; color: var(--mat-sys-color-on-surface-variant)"
      >
        本地目录暂无文件。
      </div>
      <div style="display: flex; align-items: center; margin: 8px 0; font-size: .875rem; word-break: break-all">
        <mat-chip
          variant="assist"
          color="tertiary"
          style="margin-right: 8px"
        >
          远端位置
        </mat-chip>
        <span style="color: var(--mat-sys-color-on-surface)">{{ remoteLocation }}</span>
      </div>
    </template>

    <!-- 删除冲突 -->
    <div
      v-if="conflict && isDeletionConflict"
      role="alert"
      style="display: flex; align-items: flex-start; gap: 8px; margin: 16px 0; padding: 12px 16px; border-radius: 12px; background-color: var(--mat-sys-color-error-container); color: var(--mat-sys-color-on-error-container)"
    >
      <mat-icon icon="sync_problem" />
      <div style="flex: 1">
        <div style="font-weight: 600">
          删除冲突：远端存档已删除，本机在其后仍有更新
        </div>
        <div style="margin: 4px 0 8px; font-size: .8125rem">
          保留本机存档会撤销远端删除并重新上传；确认删除会移除本机目录。
        </div>
        <div style="display: flex; gap: 8px">
          <mat-btn
            variant="filled-tonal"
            prefix="cloud_upload"
            :disabled="resolveDisabled"
            :loading="resolveLoading"
            @click="$emit('resolve', 'keep-local')"
          >
            保留本机存档
          </mat-btn>
          <mat-btn
            variant="text"
            color="error"
            prefix="delete"
            :disabled="resolveDisabled"
            :loading="resolveLoading"
            @click="$emit('resolve', 'confirm-deletion')"
          >
            确认删除
          </mat-btn>
        </div>
      </div>
    </div>

    <!-- 内容冲突 -->
    <div
      v-else-if="conflict"
      role="alert"
      style="display: flex; align-items: flex-start; gap: 8px; margin: 16px 0; padding: 12px 16px; border-radius: 12px; background-color: var(--mat-sys-color-error-container); color: var(--mat-sys-color-on-error-container)"
    >
      <mat-icon icon="sync_problem" />
      <div style="flex: 1">
        <div style="font-weight: 600">
          同步冲突：本机与远端都有更新
        </div>
        <div style="margin: 4px 0 8px; font-size: .8125rem">
          本机最后更新：{{ formatTime(conflict.localUpdatedAt) || '未知' }}；远端最后更新：{{ formatTime(conflict.remoteUpdatedAt) || '未知' }}<template v-if="conflict.remoteUpdatedBy">
            （{{ conflict.remoteUpdatedBy }}）
          </template>。保留本机会把本机快照上传覆盖远端；采用远端会用远端快照替换本机目录，未被保留一侧的新文件会丢失。
        </div>
        <div style="display: flex; gap: 8px">
          <mat-btn
            variant="filled-tonal"
            prefix="cloud_upload"
            :disabled="resolveDisabled"
            :loading="resolveLoading"
            @click="$emit('resolve', 'keep-local')"
          >
            保留本机存档
          </mat-btn>
          <mat-btn
            variant="text"
            prefix="cloud_download"
            :disabled="resolveDisabled"
            :loading="resolveLoading"
            @click="$emit('resolve', 'use-remote')"
          >
            采用远端存档
          </mat-btn>
        </div>
      </div>
    </div>

    <!-- 本地目录缺失 -->
    <div
      v-else-if="!entry.localExists"
      role="status"
      style="display: flex; align-items: flex-start; gap: 8px; margin: 16px 0; padding: 12px 16px; border-radius: 12px; background-color: var(--mat-sys-color-secondary-container); color: var(--mat-sys-color-on-secondary-container)"
    >
      <mat-icon icon="cloud_off" />
      <div style="flex: 1">
        <div style="font-weight: 600">
          本地目录不存在
        </div>
        <div style="margin-top: 4px; font-size: .8125rem">
          远端数据保持原样，可从远程恢复下载，或直接取消链接。
        </div>
        <mat-btn
          style="margin-top: 8px"
          variant="filled-tonal"
          prefix="cloud_download"
          :loading="restoreLoading"
          @click="$emit('restore')"
        >
          恢复下载
        </mat-btn>
      </div>
    </div>

    <!-- 状态与最近对账 -->
    <div
      v-else
      role="status"
      style="display: flex; align-items: flex-start; gap: 8px; margin: 16px 0; padding: 12px 16px; border-radius: 12px; background-color: var(--mat-sys-color-tertiary-container); color: var(--mat-sys-color-on-tertiary-container)"
    >
      <mat-icon icon="cloud_done" />
      <div style="flex: 1">
        <div style="font-weight: 600">
          {{ status.label }} · 本地与远程镜像同步
        </div>
        <div style="margin-top: 4px; font-size: .8125rem">
          {{ lastSyncText }}
        </div>
      </div>
    </div>

    <!-- 取消链接选项 -->
    <mat-divider style="margin-block: 8px" />
    <div style="margin: 8px 0 4px">
      <mat-switch v-model="deleteRemoteChecked">
        同时删除远程存档
      </mat-switch>
      <div style="margin: 4px 0 0 16px; font-size: .75rem; color: var(--mat-sys-color-on-surface-variant)">
        取消链接保留本机目录；勾选后删除远程存档并写入标记，其他设备同步时自动跟随删除。
      </div>
    </div>

    <template #actions>
      <mat-btn
        v-if="entry.localExists"
        variant="text"
        prefix="folder_open"
        :aria-label="`打开目录 ${entry.name}`"
        @click="$emit('open-dir')"
      >
        打开目录
      </mat-btn>

      <mat-btn
        variant="text"
        prefix="cloud_sync"
        :loading="syncing"
        :disabled="!target"
        @click="$emit('sync')"
      >
        立即同步
      </mat-btn>

      <mat-spacer />

      <mat-btn
        variant="text"
        @click="visible = false"
      >
        关闭
      </mat-btn>

      <mat-btn
        variant="filled"
        color="error"
        prefix="link_off"
        :loading="unlinkLoading"
        @click="$emit('unlink', deleteRemoteChecked)"
      >
        取消链接
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
import SavePathsPanel from '../SavePathsPanel.vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  entry: {
    type: Object,
    required: true,
  },
  // 条目状态对象
  status: {
    type: Object,
    default: null,
  },
  // 冲突条目对象
  conflict: {
    type: Object,
    default: null,
  },
  // 最近对账报告
  lastReport: {
    type: Object,
    default: null,
  },
  target: {
    type: String,
    default: '',
  },
  // 本地文件列表
  sources: {
    type: Array,
    default: () => [],
  },
  filesLoading: {
    type: Boolean,
    default: false,
  },
  unlinkLoading: {
    type: Boolean,
    default: false,
  },
  resolveLoading: {
    type: Boolean,
    default: false,
  },
  restoreLoading: {
    type: Boolean,
    default: false,
  },
  syncing: {
    type: Boolean,
    default: false,
  },
  formatTime: {
    type: Function,
    required: true,
  },
});

const emit = defineEmits([
  'update:modelValue',
  'unlink',
  'resolve',
  'restore',
  'sync',
  'open-dir',
]);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const dialogTitle = computed(() => `${props.entry.name} - 直通同步`);

const remoteLocation = computed(() => {
  if (!props.target) {
    return '未配置远程目标';
  }
  return `${props.target}/passthrough/${props.entry.entryId}`;
});

const resolveDisabled = computed(() => !props.conflict || props.resolveLoading);

// 判断冲突类型
const isDeletionConflict = computed(() => Boolean(props.conflict) && props.conflict.kind !== 'content');

// 本地缺失时默认勾选删除远程
const deleteRemoteChecked = ref(false);
watch(() => props.modelValue, (open) => {
  if (open) {
    deleteRemoteChecked.value = !props.entry.localExists;
  }
});

const lastSyncText = computed(() => {
  if (!props.lastReport?.finishedAt) {
    return '尚未同步过，变更会自动触发同步。';
  }
  const updatedThis = (props.lastReport.updated || []).some((item) => item.entryId === props.entry.entryId);
  const base = `最近对账：${props.formatTime(props.lastReport.finishedAt)}`;
  return updatedThis ? `${base}（本条目已同步）` : base;
});
</script>
