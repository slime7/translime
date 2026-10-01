<template>
  <div
    v-if="backups.length > 0"
    style="padding: 16px"
  >
    <mat-list interaction="multi-action">
      <mat-list-item
        v-for="backup in backups"
        :key="backup.id"
      >
        <template #leading>
          <mat-avatar color="secondary-container">
            <mat-icon icon="save" />
          </mat-avatar>
        </template>

        <!-- 对话框内容被 Teleport 到宿主 @scope 隔离范围之外，样式必须内联 -->
        <span style="font-weight: 700">
          {{ formatTime(backup.backupTime) }}
        </span>

        <template #supporting>
          <span
            v-if="backup.note"
            style="color: var(--mat-sys-color-primary); font-size: .875rem; font-style: italic"
          >
            “{{ backup.note }}”
          </span>
        </template>

        <template #trailing>
          <div style="display: flex; align-items: center; gap: 4px">
            <mat-tooltip
              content="还原此备份"
              location="top"
            >
              <template #activator>
                <mat-btn
                  variant="filled-tonal"
                  color="primary"
                  size="small"
                  prefix="settings_backup_restore"
                  :loading="loading.restore === backup.id"
                  @click="$emit('restore', backup)"
                >
                  还原
                </mat-btn>
              </template>
            </mat-tooltip>

            <mat-tooltip
              content="备注"
              location="top"
            >
              <template #activator>
                <mat-btn
                  icon="edit_note"
                  variant="standard"
                  size="small"
                  aria-label="编辑备注"
                  @click="$emit('edit-note', backup)"
                />
              </template>
            </mat-tooltip>

            <mat-tooltip
              content="删除备份"
              location="top"
            >
              <template #activator>
                <mat-btn
                  icon="delete"
                  variant="standard"
                  color="error"
                  size="small"
                  :loading="loading.delete === backup.id"
                  aria-label="删除备份"
                  @click="$emit('delete', backup)"
                />
              </template>
            </mat-tooltip>
          </div>
        </template>
      </mat-list-item>
    </mat-list>
  </div>

  <div
    v-else
    style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; padding: 48px 0; color: var(--mat-sys-color-on-surface-variant)"
  >
    <mat-icon
      icon="inventory_2"
      style="font-size: 64px; color: var(--mat-sys-color-outline-variant)"
    />

    <div style="margin-top: 8px">
      暂无备份记录
    </div>
  </div>
</template>

<script setup>
defineProps({
  backups: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Object,
    required: true,
  },
  formatTime: {
    type: Function,
    required: true,
  },
});

defineEmits(['restore', 'edit-note', 'delete']);
</script>
