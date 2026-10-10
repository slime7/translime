<template>
  <!-- mat-dialog 内容被 Teleport 到宿主 @scope 隔离范围之外，样式必须内联 -->
  <mat-dialog
    v-model="visible"
    width="560px"
    close-on-back
    title="添加直通存档"
  >
    <div style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 4px">
      <mat-text-field
        v-model="saveName"
        style="width: 100%"
        label="存档名称"
        placeholder="例如：艾尔登法环"
        variant="outlined"
        color="primary"
        :max-length="80"
      />

      <mat-text-field
        v-model="newDir"
        style="width: 100%"
        label="存档目录"
        placeholder="选择要与远程同步的目录（允许空目录）"
        variant="outlined"
        color="primary"
        readonly
        @click="pickDir"
      >
        <template #trailing>
          <mat-btn
            icon="folder_open"
            variant="standard"
            size="small"
            aria-label="选择目录"
            @click.stop="pickDir"
          />
        </template>
      </mat-text-field>

      <div
        v-if="formError"
        role="alert"
        style="font-size: .875rem; color: var(--mat-sys-color-error)"
      >
        {{ formError }}
      </div>
    </div>

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
        prefix="add"
        :disabled="!canAdd"
        :loading="loading"
        @click="submit"
      >
        添加
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
import { useDialog } from 'translime-sdk';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue', 'submit']);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const saveName = ref('');
const newDir = ref('');
const formError = ref('');

const canAdd = computed(() => Boolean(saveName.value.trim() && newDir.value) && !props.loading);

watch(visible, (open) => {
  if (open) {
    formError.value = '';
  }
});

// 提交结果由父组件回传（成功关闭对话框，失败展示错误）
const setFormError = (message) => {
  formError.value = message || '';
};

const pickDir = async () => {
  const dialog = useDialog();
  if (!dialog) {
    return;
  }
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'dontAddToRecent'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    [newDir.value] = result.filePaths;
    formError.value = '';
  }
};

const submit = () => {
  if (!canAdd.value) {
    return;
  }
  emit('submit', {
    name: saveName.value.trim(),
    dir: newDir.value,
  }, setFormError);
};

defineExpose({
  reset() {
    saveName.value = '';
    newDir.value = '';
    formError.value = '';
  },
});
</script>
