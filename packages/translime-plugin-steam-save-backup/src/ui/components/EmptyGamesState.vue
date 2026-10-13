<template>
  <div class="flex flex-col items-center justify-center w-full">
    <mat-icon
      :icon="icon"
      class="empty-icon"
    />

    <div class="empty-title mt-4 text-xl">
      {{ title }}
    </div>

    <div class="empty-hint mt-1 text-sm">
      {{ hint }}
    </div>

    <mat-btn
      class="mt-4"
      variant="text"
      color="primary"
      @click="$emit('action')"
    >
      {{ actionText }}
    </mat-btn>
  </div>
</template>

<script setup>
defineProps({
  icon: {
    type: String,
    default: 'sports_esports',
  },
  title: {
    type: String,
    required: true,
  },
  hint: {
    type: String,
    default: '',
  },
  actionText: {
    type: String,
    default: '重新扫描',
  },
});

defineEmits(['action']);
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
