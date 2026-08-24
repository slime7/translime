<template>
  <v-dialog
    v-model="visible"
    persistent
    max-width="500px"
    data-test="theme-select-dialog"
  >
    <v-card color="surface-container-high">
      <v-card-title>选择主题</v-card-title>

      <v-card-text>
        <mde-list>
          <mde-list-item
            data-test="theme-option-light"
            item-type="radio"
            title="明亮"
            :is-active="selectedTheme === 'light'"
            @click="selectedTheme = 'light'"
          />
          <mde-list-item
            data-test="theme-option-dark"
            item-type="radio"
            title="暗黑"
            :is-active="selectedTheme === 'dark'"
            @click="selectedTheme = 'dark'"
          />
          <mde-list-item
            data-test="theme-option-system"
            item-type="radio"
            title="系统"
            :is-active="selectedTheme === 'system'"
            @click="selectedTheme = 'system'"
          />
        </mde-list>
      </v-card-text>

      <v-card-actions>
        <v-spacer />

        <v-btn
          data-test="theme-dialog-cancel-btn"
          color="primary"
          @click="onCancel"
        >
          取消
        </v-btn>

        <v-btn
          data-test="theme-dialog-confirm-btn"
          color="primary"
          variant="elevated"
          @click="onConfirm"
        >
          确定
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import useTheme from '@/hooks/useTheme';
import useGlobalStore from '@/store/globalStore';
import MdeList from '@/components/MdeList.vue';
import MdeListItem from '@/components/MdeListItem.vue';

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
