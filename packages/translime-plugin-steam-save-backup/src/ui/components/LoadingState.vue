<template>
  <div class="text-center mt-10">
    <mat-progress
      variant="circular"
      indeterminate
      :size="64"
      class="loading-spinner"
      aria-label="正在扫描 Steam 游戏"
    />

    <div class="loading-text mt-4">
      正在扫描 Steam 游戏...
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.loading-spinner {
  display: inline-block;
}

.loading-text {
  color: var(--mat-sys-color-on-surface-variant);
}
</style>
