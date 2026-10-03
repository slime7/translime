<template>
  <!-- mat-dialog 内容被 Teleport 到宿主 @scope 隔离范围之外，样式必须内联 -->
  <mat-dialog
    v-model="visible"
    width="800px"
    close-on-back
    :title="dialogTitle"
  >
    <save-paths-panel :game="selectedGame" />

    <div
      v-if="selectedGame?.uninstalled"
      role="status"
      style="display: flex; align-items: flex-start; gap: 8px; margin: 16px 0; padding: 12px 16px; border-radius: 12px; background-color: var(--mat-sys-color-secondary-container); color: var(--mat-sys-color-on-secondary-container)"
    >
      <mat-icon icon="info" />
      <span>
        该游戏已从 Steam 卸载；仍可还原、删除其存档备份，重新安装后可继续备份。
      </span>
    </div>

    <div
      v-else-if="!canBackup"
      role="status"
      style="display: flex; align-items: flex-start; gap: 8px; margin: 16px 0; padding: 12px 16px; border-radius: 12px; background-color: var(--mat-sys-color-tertiary-container); color: var(--mat-sys-color-on-tertiary-container)"
    >
      <mat-icon icon="warning" />
      <span>
        无法自动定位该游戏的存档路径，暂不支持备份。可在主页面工具栏“手动添加”中为该游戏指定存档目录。
      </span>
    </div>

    <backup-list
      :backups="backups"
      :loading="loading"
      :format-time="formatTime"
      @restore="$emit('restore', $event)"
      @edit-note="$emit('edit-note', $event)"
      @delete="$emit('delete', $event)"
    />

    <template #actions>
      <mat-tooltip
        :content="syncAvailable ? '将本地备份与远程位置对账' : '请先在同步设置中配置远程位置'"
        location="top"
      >
        <template #activator>
          <mat-btn
            variant="text"
            prefix="cloud_sync"
            :loading="syncRunning"
            :disabled="!syncAvailable"
            aria-label="立即同步"
            @click="$emit('sync')"
          >
            同步
          </mat-btn>
        </template>
      </mat-tooltip>

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
        prefix="cloud_upload"
        :loading="loading.backup"
        :disabled="!canBackup"
        @click="$emit('backup')"
      >
        立即备份
      </mat-btn>
    </template>
  </mat-dialog>
</template>

<script setup>
import { computed } from 'vue';
import BackupList from './BackupList.vue';
import SavePathsPanel from './SavePathsPanel.vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  selectedGame: {
    type: Object,
    default: null,
  },
  backups: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Object,
    required: true,
  },
  canBackup: {
    type: Boolean,
    default: false,
  },
  syncRunning: {
    type: Boolean,
    default: false,
  },
  syncAvailable: {
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
  'backup',
  'sync',
  'restore',
  'delete',
  'edit-note',
]);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const dialogTitle = computed(() => {
  if (!props.selectedGame) {
    return '备份管理';
  }
  return props.selectedGame.isCustom
    ? `${props.selectedGame.name} - 备份管理`
    : `(${props.selectedGame.appid}) ${props.selectedGame.name} - 备份管理`;
});
</script>
