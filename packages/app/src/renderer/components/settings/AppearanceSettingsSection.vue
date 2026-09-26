<template>
  <div class="mb-4 break-inside-avoid w-full max-w-100 mx-auto">
    <div class="text-mat-label-large text-primary">
      外观
    </div>

    <mat-list
      variant="segmented"
      interaction="single-action"
      class="settings-list mt-2"
    >
      <mat-list-item
        data-test="setting-theme-item"
        @click="themeDialogVisible = true"
      >
        主题
        <template #trailing>
          <div class="text-on-surface-variant">
            {{ currentThemeName }}
          </div>
        </template>
      </mat-list-item>
      <mat-list-item
        data-test="setting-color-item"
        @click="colorDialogVisible = true"
      >
        颜色
        <template #trailing>
          <div class="text-on-surface-variant">
            {{ themeColorName }}
          </div>
        </template>
      </mat-list-item>
    </mat-list>

    <theme-select-dialog v-model="themeDialogVisible" />
    <theme-color-dialog v-model="colorDialogVisible" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import useGlobalStore from '@/store/globalStore';
import ThemeSelectDialog from './ThemeSelectDialog.vue';
import ThemeColorDialog from './ThemeColorDialog.vue';
import {
  THEME_COLOR_VARIANTS,
  THEME_MAP,
} from './themeOptions';

const store = useGlobalStore();
const settings = store.appSetting;
const themeDialogVisible = ref(false);
const colorDialogVisible = ref(false);

const currentThemeName = computed(() => THEME_MAP[settings.theme]);

const themeColorName = computed(() => {
  switch (settings.themeColor.name) {
  case 'translime':
    return '默认';
  case 'system':
    return '跟随系统';
  case 'custom':
  default: {
    const currentVariant = THEME_COLOR_VARIANTS.find(
      (item) => item.value === settings.themeColor.variant,
    );
    return `${settings.themeColor.source} - ${currentVariant?.title || settings.themeColor.variant}`;
  }
  }
});
</script>

<style scoped>
.settings-list {
  border-radius: 16px;
}
</style>
