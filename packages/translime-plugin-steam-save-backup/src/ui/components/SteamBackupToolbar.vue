<template>
  <div class="flex items-center gap-2">
    <template v-if="collapsed">
      <mat-tooltip
        content="远程同步"
        location="bottom"
      >
        <template #activator>
          <mat-btn
            :icon="syncIcon"
            variant="filled-tonal"
            :loading="syncRunning"
            aria-label="远程同步设置"
            @click="$emit('open-sync')"
          />
        </template>
      </mat-tooltip>

      <mat-tooltip
        content="打开备份目录"
        location="bottom"
      >
        <template #activator>
          <mat-btn
            icon="folder_open"
            variant="filled-tonal"
            :loading="openDirLoading"
            aria-label="打开备份目录"
            @click="$emit('open-backup-dir')"
          />
        </template>
      </mat-tooltip>

      <mat-tooltip
        content="手动添加存档目录"
        location="bottom"
      >
        <template #activator>
          <mat-btn
            icon="create_new_folder"
            variant="filled-tonal"
            aria-label="手动添加存档目录"
            @click="$emit('add-custom-dir')"
          />
        </template>
      </mat-tooltip>

      <mat-tooltip
        content="刷新列表"
        location="bottom"
      >
        <template #activator>
          <mat-btn
            icon="refresh"
            variant="filled-tonal"
            :loading="scanLoading"
            aria-label="刷新列表"
            @click="$emit('scan-games')"
          />
        </template>
      </mat-tooltip>
    </template>

    <template v-else>
      <mat-btn
        variant="filled-tonal"
        :prefix="syncIcon"
        :loading="syncRunning"
        @click="$emit('open-sync')"
      >
        同步
      </mat-btn>

      <mat-btn
        variant="filled-tonal"
        prefix="folder_open"
        :loading="openDirLoading"
        @click="$emit('open-backup-dir')"
      >
        打开备份目录
      </mat-btn>

      <mat-btn
        variant="filled-tonal"
        prefix="create_new_folder"
        @click="$emit('add-custom-dir')"
      >
        手动添加
      </mat-btn>

      <mat-btn
        variant="filled-tonal"
        prefix="refresh"
        :loading="scanLoading"
        @click="$emit('scan-games')"
      >
        刷新列表
      </mat-btn>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  collapsed: {
    type: Boolean,
    default: false,
  },
  openDirLoading: {
    type: Boolean,
    default: false,
  },
  scanLoading: {
    type: Boolean,
    default: false,
  },
  syncRunning: {
    type: Boolean,
    default: false,
  },
  syncError: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['open-backup-dir', 'add-custom-dir', 'scan-games', 'open-sync']);

const syncIcon = computed(() => (props.syncError ? 'cloud_off' : 'cloud_sync'));
</script>
