<template>
  <div class="flex flex-col items-center justify-center w-full mt-10">
    <mat-icon
      icon="sports_esports"
      class="empty-icon"
    />

    <div class="empty-title mt-4 text-xl">
      未发现 Steam 游戏
    </div>

    <div class="empty-hint mt-1 text-sm">
      请尝试在插件设置中手动配置 Steam 路径
    </div>

    <mat-btn
      class="mt-4"
      variant="text"
      color="primary"
      @click="$emit('scan')"
    >
      重新扫描
    </mat-btn>
  </div>
</template>

<script setup>
defineEmits(['scan']);
</script>

<style scoped>
.empty-icon {
  font-size: 80px;
  color: var(--mat-sys-color-outline-variant);
}

.empty-title {
  color: var(--mat-sys-color-on-surface-variant);
}

.empty-hint {
  color: var(--mat-sys-color-outline);
}
</style>
