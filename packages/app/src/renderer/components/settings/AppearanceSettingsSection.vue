<template>
  <div class="mb-4 break-inside-avoid w-full max-w-100 mx-auto">
    <div class="text-primary">
      外观
    </div>

    <mde-list class="mt-2">
      <mde-list-item
        data-test="setting-theme-item"
        title="主题"
        item-type="select"
        :selected="currentThemeName"
        @click="themeDialogVisible = true"
      />
      <mde-list-item
        data-test="setting-color-item"
        title="颜色"
        item-type="select"
        :selected="themeColorName"
        @click="colorDialogVisible = true"
      />
    </mde-list>

    <theme-select-dialog v-model="themeDialogVisible" />
    <theme-color-dialog v-model="colorDialogVisible" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import useGlobalStore from '@/store/globalStore';
import MdeList from '@/components/MdeList.vue';
import MdeListItem from '@/components/MdeListItem.vue';
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
