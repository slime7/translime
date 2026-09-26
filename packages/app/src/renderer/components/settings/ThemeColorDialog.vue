<template>
  <mat-dialog
    v-model="visible"
    width="640"
    title="选择颜色"
  >
    <div class="mt-4">
      <mat-btn-group
        variant="connected"
        selection="single"
        :selected="dialogState.selected"
        @select="onGroupSelect"
      >
        <mat-btn value="translime">
          默认
        </mat-btn>

        <mat-btn value="system">
          系统
        </mat-btn>

        <mat-btn value="custom">
          自定义
        </mat-btn>
      </mat-btn-group>
    </div>

    <div
      v-if="dialogState.selected === 'custom'"
      class="rounded-2xl mt-4 p-4 bg-surface-container flex items-center justify-between"
    >
      <div class="flex items-center gap-4">
        <color-picker
          v-model="dialogState.customColor"
          rounded
        />
        <div>颜色来源</div>
      </div>

      <mat-btn
        icon="shuffle"
        label="随机颜色"
        variant="text"
        @click="generateRandomColor"
      />
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      <theme-color-preview-card
        v-if="dialogState.selected === 'translime'"
        title="默认"
        :colors="translimePreviewColors"
        :selected="dialogState.selected === 'translime'"
        @click="onSelectThemeColor('translime')"
      />

      <template v-if="isGeneratedThemeSelected && dialogState.customThemeList?.length">
        <theme-color-preview-card
          v-for="customThemeItem in dialogState.customThemeList"
          :key="customThemeItem.variant"
          :title="customThemeItem.variantTitle"
          :colors="getThemePreviewColors(customThemeItem.schemes)"
          :selected="dialogState.customColorVariant === customThemeItem.variant"
          @click="onSelectThemeColor(dialogState.selected, customThemeItem.source, customThemeItem.variant)"
        />
      </template>
    </div>

    <template #actions>
      <div class="grow" />

      <mat-btn
        color="primary"
        @click="visible = false"
      >
        取消
      </mat-btn>

      <mat-btn
        color="primary"
        variant="filled"
        @click="setColorDialogConfirm"
      >
        确定
      </mat-btn>
    </template>
  </mat-dialog>
</template>

<script setup>
import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  watch,
} from 'vue';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import useTheme from '@/hooks/useTheme';
import { useIpc } from '@/hooks/electron';
import useMdColor from '@/hooks/useMdColor';
import useGlobalStore from '@/store/globalStore';
import ColorPicker from '@/components/ColorPicker.vue';
import ThemeColorPreviewCard from '@/components/ThemeColorPreviewCard.vue';
import {
  DEFAULT_THEME_COLOR_SOURCE,
  DEFAULT_THEME_COLOR_VARIANT,
  normalizeThemeColor,
} from '@/utils/themeColorConfig';
import { THEME_COLOR_VARIANTS } from './themeOptions';

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true,
  },
});

const emit = defineEmits(['update:modelValue']);

const ipc = useIpc();
const theme = useTheme();
const mdColor = useMdColor();
const store = useGlobalStore();
const settings = store.appSetting;

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const dialogState = reactive({
  selected: '',
  customColor: '#000000',
  customColorVariant: DEFAULT_THEME_COLOR_VARIANT,
  customThemeList: [],
  isSystemColorSupported: false,
  translimeThemeColors: {
    light: {
      primary: '#00649c',
      secondary: '#7a546a',
      tertiary: '#944271',
      error: '#ac3434',
    },
    dark: {
      primary: '#b8dbff',
      secondary: '#debece',
      tertiary: '#ffafd7',
      error: '#ff716c',
    },
  },
});

const isGeneratedThemeSelected = computed(() => ['custom', 'system'].includes(dialogState.selected));

const translimePreviewColors = computed(() => {
  const scheme = dialogState.translimeThemeColors[store.dark ? 'dark' : 'light'];

  return [scheme.primary, scheme.secondary, scheme.tertiary, scheme.error];
});

const getThemePreviewColors = (schemes) => {
  const scheme = schemes[store.dark ? 'dark' : 'light'];

  return [scheme.primary, scheme.secondary, scheme.tertiary, scheme.error];
};

const rebuildCustomThemeList = (color) => {
  dialogState.customThemeList = THEME_COLOR_VARIANTS.map((item) => {
    const themeResult = mdColor.getThemeColorFromColor(color, item.value);
    return {
      variant: item.value,
      variantTitle: item.title,
      source: themeResult.source,
      schemes: themeResult.schemes,
    };
  });
};

const initCustomThemeColor = () => {
  const themeColor = normalizeThemeColor(settings.themeColor);
  dialogState.selected = themeColor.name;
  dialogState.customColor = themeColor.source;
  dialogState.customColorVariant = themeColor.variant;
  rebuildCustomThemeList(dialogState.customColor);
};

const initSystemColor = async () => {
  const color = await ipc.invoke(ipcType.GET_SYSTEM_COLOR);
  if (color) {
    dialogState.isSystemColorSupported = true;
    if (dialogState.selected === 'system') {
      dialogState.customColor = color;
      rebuildCustomThemeList(color);
    }
  }
};

const onGroupSelect = ({ nextSelected }) => {
  if (!nextSelected) {
    return;
  }
  onSelectThemeColor(nextSelected);
};

const onSelectThemeColor = async (name, source = null, variant = null) => {
  dialogState.selected = name;
  if (name === 'system') {
    const color = await ipc.invoke(ipcType.GET_SYSTEM_COLOR);
    if (color) {
      dialogState.customColor = color;
    }
  } else if (source) {
    dialogState.customColor = source;
  }

  if (variant) {
    dialogState.customColorVariant = variant;
  }
};

const generateRandomColor = () => {
  dialogState.customColor = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
};

const setColorDialogConfirm = () => {
  const themeColor = normalizeThemeColor({
    name: dialogState.selected,
    source: dialogState.customColor,
    variant: dialogState.customColorVariant,
  });
  let themeColorItem;

  if (dialogState.selected === 'system' || dialogState.selected === 'custom') {
    themeColorItem = dialogState.customThemeList.find(
      (item) => item.variant === dialogState.customColorVariant,
    );
  } else if (dialogState.selected === 'translime') {
    const themeResult = mdColor.getThemeColorFromColor(DEFAULT_THEME_COLOR_SOURCE, DEFAULT_THEME_COLOR_VARIANT);
    themeColorItem = { schemes: themeResult.schemes };
  }

  const vuetifyColors = mdColor.getVuetifyColors({ schemes: themeColorItem.schemes });
  theme.setCustomTheme(vuetifyColors, themeColor);
  visible.value = false;
};

watch(() => props.modelValue, async (value) => {
  if (!value) {
    return;
  }

  initCustomThemeColor();
  await initSystemColor();
});

watch(() => dialogState.customColor, (color) => {
  rebuildCustomThemeList(color);
});

onMounted(() => {
  ipc.on(ipcType.SYSTEM_COLOR_CHANGED, ({ color }) => {
    if (visible.value && dialogState.selected === 'system') {
      dialogState.customColor = color;
    }
  });
});

onUnmounted(() => {
  ipc.detach(ipcType.SYSTEM_COLOR_CHANGED);
});
</script>
