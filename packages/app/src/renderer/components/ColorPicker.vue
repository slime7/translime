<script setup>
import { computed, ref } from 'vue';

const model = defineModel({
  type: String,
});
const props = defineProps({
  rounded: {
    type: Boolean,
    default: false,
  },
  alpha: {
    type: Boolean,
    default: false,
  },
  size: {
    type: String,
    default: 'normal',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

const sizeClass = computed(() => ({
  normal: 'w-12 h-12',
  small: 'w-8 h-8',
  large: 'w-16 h-16',
}[props.size]));

const tempColor = ref(model.value);
const dialogVisible = ref(false);
const openDialog = () => {
  if (props.disabled) {
    return;
  }
  tempColor.value = model.value;
  dialogVisible.value = true;
};
const setColorDialogCancel = () => {
  dialogVisible.value = false;
};
const setColorDialogConfirm = () => {
  model.value = tempColor.value;
  dialogVisible.value = false;
};
</script>

<template>
  <div class="color-picker">
    <div
      class="border-2 border-outline"
      :class="[sizeClass, { 'rounded-full': rounded }]"
      :style="{ 'background-color': model }"
      @click="openDialog"
    />

    <mat-dialog
      v-model="dialogVisible"
      width="364"
      title="颜色选择器"
    >
      <div class="flex justify-center">
        <input
          v-model="tempColor"
          type="color"
          class="color-picker__input"
          aria-label="选择颜色"
        >
      </div>

      <template #actions>
        <div class="grow" />

        <mat-btn
          color="primary"
          variant="text"
          @click="setColorDialogCancel"
        >
          取消
        </mat-btn>

        <mat-btn
          color="primary"
          variant="filled"
          @click="setColorDialogConfirm"
        >
          确认
        </mat-btn>
      </template>
    </mat-dialog>
  </div>
</template>

<style scoped>
.color-picker__input {
  inline-size: 240px;
  block-size: 180px;
  padding: 0;
  border: none;
  background: none;
}

.color-picker__input::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-picker__input::-webkit-color-swatch {
  border: 1px solid var(--mat-sys-color-outline-variant);
  border-radius: 12px;
}
</style>
