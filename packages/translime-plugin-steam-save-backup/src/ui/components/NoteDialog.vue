<template>
  <!-- mat-dialog 内容被 Teleport 到宿主 @scope 隔离范围之外，样式必须内联 -->
  <mat-dialog
    v-model="visible"
    width="400px"
    close-on-back
    title="编辑备注"
  >
    <mat-text-field
      v-model="noteValue"
      style="width: 100%"
      label="备份说明"
      placeholder="例如：打 BOSS 前、某个结局等"
      variant="outlined"
      color="primary"
      :max-length="80"
      @keyup.enter="$emit('save')"
    />

    <template #actions>
      <mat-spacer />

      <mat-btn
        variant="text"
        @click="visible = false"
      >
        取消
      </mat-btn>

      <mat-btn
        variant="filled"
        color="primary"
        :loading="loading"
        @click="$emit('save')"
      >
        保存
      </mat-btn>
    </template>
  </mat-dialog>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  note: {
    type: String,
    default: '',
  },
  loading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue', 'update:note', 'save']);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const noteValue = computed({
  get: () => props.note,
  set: (value) => emit('update:note', value),
});
</script>
