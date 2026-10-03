<template>
  <div class="flex items-center gap-2">
    <!-- 打开备份目录与同步设置在宿主顶栏按钮区（两个视图共用） -->
    <template v-if="collapsed">
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
defineProps({
  collapsed: {
    type: Boolean,
    default: false,
  },
  scanLoading: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['add-custom-dir', 'scan-games']);
</script>
