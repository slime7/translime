<template>
  <mat-dialog
    v-model="visible"
    width="500"
    title="选择主题"
    data-test="theme-select-dialog"
  >
    <mat-list
      variant="segmented"
      interaction="single-action"
      class="settings-list"
    >
      <mat-list-item
        data-test="theme-option-light"
        @click="selectedTheme = 'light'"
      >
        明亮
        <template #trailing>
          <mat-radio
            :model-value="selectedTheme === 'light'"
            :value="true"
            class="pointer-events-none"
            color="primary"
            aria-hidden="true"
          />
        </template>
      </mat-list-item>
      <mat-list-item
        data-test="theme-option-dark"
        @click="selectedTheme = 'dark'"
      >
        暗黑
        <template #trailing>
          <mat-radio
            :model-value="selectedTheme === 'dark'"
            :value="true"
            class="pointer-events-none"
            color="primary"
            aria-hidden="true"
          />
        </template>
      </mat-list-item>
      <mat-list-item
        data-test="theme-option-system"
        @click="selectedTheme = 'system'"
      >
        系统
        <template #trailing>
          <mat-radio
            :model-value="selectedTheme === 'system'"
            :value="true"
            class="pointer-events-none"
            color="primary"
            aria-hidden="true"
          />
        </template>
      </mat-list-item>
    </mat-list>

    <template #actions>
      <div class="grow" />

      <mat-btn
        data-test="theme-dialog-cancel-btn"
        color="primary"
        variant="text"
        @click="onCancel"
      >
        取消
      </mat-btn>

      <mat-btn
        data-test="theme-dialog-confirm-btn"
        color="primary"
        variant="filled"
        @click="onConfirm"
      >
        确定
      </mat-btn>
    </template>
  </mat-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import useTheme from '@/hooks/useTheme';
import useGlobalStore from '@/store/globalStore';

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true,
  },
});

const emit = defineEmits(['update:modelValue']);

const theme = useTheme();
const store = useGlobalStore();
const selectedTheme = ref(store.appSetting.theme);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

watch(() => props.modelValue, (value) => {
  if (value) {
    selectedTheme.value = store.appSetting.theme;
  }
});

const onCancel = () => {
  visible.value = false;
  selectedTheme.value = store.appSetting.theme;
};

const onConfirm = () => {
  visible.value = false;
  theme.setTheme(selectedTheme.value);
};
</script>

<style scoped>
.settings-list {
  border-radius: 16px;
}
</style>
