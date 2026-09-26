<template>
  <div class="simple-dialog-frame">
    <mat-dialog
      v-for="(dialog, index) in dialogs"
      :key="`simple-dialog-${index}`"
      :model-value="true"
      :title="dialog.title"
      :width="dialog.attr?.['max-width'] || dialog.attr?.maxWidth || undefined"
      @update:model-value="close"
    >
      <!-- eslint-disable-next-line vue/no-v-text-v-html-on-component -->
      <div v-html="dialog.content" />

      <template #actions>
        <div class="grow" />

        <mat-btn
          v-if="!dialog.hideClose"
          @click="close"
        >
          关闭
        </mat-btn>
      </template>
    </mat-dialog>

    <div
      v-if="loader"
      class="fixed inset-0 z-50 flex items-center justify-center"
      role="status"
      aria-label="加载中"
    >
      <div
        class="loader-wrapper m-4 flex items-center justify-center rounded-full bg-surface-container-high shadow-[var(--mat-sys-elevation-level3)]"
      >
        <mat-progress
          variant="circular"
          indeterminate
          color="primary"
          :size="32"
        />
      </div>
    </div>

    <mat-dialog
      v-model="confirm.visible"
      width="290"
      :title="confirm.title || '提示'"
    >
      <!-- eslint-disable-next-line vue/no-v-text-v-html-on-component -->
      <div v-text="confirm.content" />

      <template #actions>
        <div class="grow" />

        <mat-btn
          variant="text"
          @click="confirm.reject"
        >
          取消
        </mat-btn>
        <mat-btn
          color="primary"
          @click="confirm.resolve"
        >
          确定
        </mat-btn>
      </template>
    </mat-dialog>
  </div>
</template>

<script>
import useDialog from '@/hooks/useDialog';

export default {
  name: 'SimpleDialog',

  setup() {
    const dialog = useDialog();
    const {
      dialogs,
      titleClass,
      loader,
      confirm,
    } = dialog;

    const close = () => {
      dialog.pop();
    };

    return {
      dialogs,
      titleClass,
      loader,
      confirm,
      close,
    };
  },
};
</script>

<style scoped>
.loader-wrapper {
  width: 64px;
  height: 64px;
}
</style>
