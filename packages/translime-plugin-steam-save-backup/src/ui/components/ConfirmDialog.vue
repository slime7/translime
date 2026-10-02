<template>
  <!-- mat-dialog 内容被 Teleport 到宿主 @scope 隔离范围之外，样式必须内联 -->
  <mat-dialog
    v-model="visible"
    width="400px"
    :title="dialog.title"
    :icon="dialog.icon || undefined"
    :color="matColor"
  >
    <div style="color: var(--mat-sys-color-on-surface)">
      {{ dialog.message }}
    </div>

    <div
      v-if="dialog.detail"
      style="margin-top: 4px; font-style: italic; font-weight: 500; color: var(--mat-sys-color-on-surface-variant)"
    >
      {{ dialog.detail }}
    </div>

    <div
      v-if="dialog.switchLabel"
      style="margin-top: 12px"
    >
      <mat-switch v-model="switchChecked">
        {{ dialog.switchLabel }}
      </mat-switch>
    </div>

    <template #actions>
      <mat-spacer />

      <mat-btn
        variant="text"
        :disabled="dialog.loading"
        @click="visible = false"
      >
        取消
      </mat-btn>

      <mat-btn
        variant="filled"
        :color="matColor"
        :loading="dialog.loading"
        @click="$emit('confirm', switchChecked)"
      >
        {{ dialog.confirmText }}
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

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  dialog: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['update:modelValue', 'confirm']);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

// 可选的附加开关（如“同时删除远程存档”），随确认事件把选中状态回传给调用方
const switchChecked = ref(false);

watch(() => props.dialog, (dialog) => {
  switchChecked.value = Boolean(dialog?.switchDefault);
}, { immediate: true, deep: true });

// mde-vue 语义色没有 warning，把 warning 映射为 tertiary
const matColor = computed(() => {
  if (props.dialog.color === 'error') {
    return 'error';
  }
  if (props.dialog.color === 'warning') {
    return 'tertiary';
  }
  return 'primary';
});
</script>
