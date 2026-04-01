<template>
  <v-dialog
    v-model="visible"
    persistent
    scrollable
    max-width="640px"
  >
    <v-card color="surface-container-high">
      <v-card-title>选择颜色</v-card-title>

      <v-card-text>
        <div class="mt-4 space-x-0.5">
          <v-btn
            rounded
            class="rounded-s-4xl"
            :class="[dialogState.selected === 'translime' ? 'rounded-e-4xl' : 'rounded-e-sm']"
            :color="dialogState.selected === 'translime' ? 'primary' : 'surface-variant'"
            @click="onSelectThemeColor('translime')"
          >
            默认
          </v-btn>

          <v-btn
            rounded
            :class="[dialogState.selected === 'system' ? 'rounded-4xl' : 'rounded-sm']"
            :color="dialogState.selected === 'system' ? 'primary' : 'surface-variant'"
            @click="onSelectThemeColor('system')"
          >
            系统
          </v-btn>

          <v-btn
            rounded
            class="rounded-e-4xl"
            :class="[dialogState.selected === 'custom' ? 'rounded-s-4xl' : 'rounded-s-sm']"
            :color="dialogState.selected === 'custom' ? 'primary' : 'surface-variant'"
            @click="onSelectThemeColor('custom')"
          >
            自定义
          </v-btn>
        </div>

        <v-card
          v-if="dialogState.selected === 'custom'"
          class="rounded-2xl mt-4"
          variant="flat"
          rounded
          title="颜色来源"
        >
          <template #prepend>
            <color-picker
              v-model="dialogState.customColor"
              rounded
            />
          </template>
          <template #append>
            <v-btn
              icon="shuffle"
              variant="plain"
              @click="generateRandomColor"
            />
          </template>
        </v-card>

        <div class="mt-4 flex flex-wrap gap-2">
          <theme-color-preview-card
            v-if="dialogState.selected === 'translime'"
            title="默认"
            :colors="translimePreviewColors"
            :selected="dialogState.selected === 'translime'"
            :color="dialogState.selected === 'translime' ? 'primary' : 'outline'"
            @click="onSelectThemeColor('translime')"
          />

          <template v-if="isGeneratedThemeSelected && dialogState.customThemeList?.length">
            <theme-color-preview-card
              v-for="customThemeItem in dialogState.customThemeList"
              :key="customThemeItem.variant"
              :title="customThemeItem.variantTitle"
              :colors="getThemePreviewColors(customThemeItem.schemes)"
              :selected="dialogState.customColorVariant === customThemeItem.variant"
              :color="dialogState.customColorVariant === customThemeItem.variant ? 'primary' : 'outline'"
              @click="onSelectThemeColor(dialogState.selected, customThemeItem.source, customThemeItem.variant)"
            />
          </template>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />

        <v-btn
          color="primary"
          @click="visible = false"
        >
          取消
        </v-btn>

        <v-btn
          color="primary"
          variant="elevated"
          @click="setColorDialogConfirm"
        >
          确定
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
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
  customColor: '#000',
  customColorVariant: 'SchemeTonalSpot',
  customThemeList: [],
  isSystemColorSupported: false,
  translimeThemeColors: {
    light: {
      primary: '#00639b',
      secondary: '#51606f',
      tertiary: '#68587a',
      error: '#ba1a1a',
    },
    dark: {
      primary: '#96cbff',
      secondary: '#b9c8da',
      tertiary: '#d3bfe6',
      error: '#ffb4ab',
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
  dialogState.selected = settings.themeColor.name;
  dialogState.customColor = settings.themeColor.source;
  dialogState.customColorVariant = settings.themeColor.variant;
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
  const themeColor = {
    name: dialogState.selected,
    source: dialogState.customColor,
    variant: dialogState.customColorVariant,
  };
  let themeColorItem;

  if (dialogState.selected === 'system' || dialogState.selected === 'custom') {
    themeColorItem = dialogState.customThemeList.find(
      (item) => item.variant === dialogState.customColorVariant,
    );
  } else if (dialogState.selected === 'translime') {
    const themeResult = mdColor.getThemeColorFromColor('#20a6fc', 'SchemeRainbow');
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
