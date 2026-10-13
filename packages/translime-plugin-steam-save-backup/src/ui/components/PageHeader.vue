<template>
  <div class="page-header">
    <div class="page-header-text">
      <div class="page-header-title">
        <slot name="title">
          {{ title }}
        </slot>
      </div>
      <div
        v-if="description"
        class="page-header-desc"
      >
        {{ description }}
      </div>
    </div>
    <div
      v-if="$slots.actions"
      class="page-header-actions"
    >
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
});
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.page-header-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.page-header-title {
  font-size: 1.0625rem;
  font-weight: 600;
  color: var(--mat-sys-color-on-surface);
}

.page-header-desc {
  font-size: .8125rem;
  color: var(--mat-sys-color-on-surface-variant);
}

.page-header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
</style>
