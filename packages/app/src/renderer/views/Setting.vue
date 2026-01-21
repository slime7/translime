<template>
  <v-container class="setting">
    <div class="text-center text-5xl">
      设置
    </div>

    <div class="mt-4 columns-1 lg:columns-2 gap-4 mx-auto max-w-204">
      <div class="mb-4 break-inside-avoid w-full max-w-100 mx-auto">
        <div class="text-primary">
          通用
        </div>

        <mde-list class="mt-2">
          <mde-list-item
            title="开机自动启动"
            item-type="switch"
            :is-active="settings.openAtLogin"
            @click="onOpenAtLogin(!settings.openAtLogin)"
          />
          <mde-list-item
            title="显示开发中插件(重启后生效)"
            item-type="switch"
            :is-active="settings.showDevPlugin"
            @click="onShowDevPlugin(!settings.showDevPlugin)"
          />
        </mde-list>

        <mde-list class="mt-2">
          <mde-list-item
            title="打开 devtools(F12)"
            @click="showDevtools"
          />
          <mde-list-item
            title="重新启动"
            @click="relaunch"
          />
        </mde-list>
      </div>

      <div class="mb-4 break-inside-avoid w-full max-w-100 mx-auto">
        <div class="text-primary">
          插件域名
        </div>

        <mde-list class="mt-2">
          <mde-list-item
            v-for="registry in registryList"
            :key="registry.id"
            item-type="radio"
            :lines="registry.link ? 'two' : 'one'"
            :title="registry.name"
            :subtitle="registry.link || null"
            :is-active="settings.registry === registry.link"
            @click="onSelectRegistry(registry.link, registry.id)"
          />
        </mde-list>
      </div>

      <div class="mb-4 break-inside-avoid w-full max-w-100 mx-auto">
        <div class="text-primary">
          外观
        </div>

        <mde-list class="mt-2">
          <mde-list-item
            title="主题"
            item-type="select"
            :selected="currentThemeName"
            @click="setThemeDialogOpen"
          />
          <mde-list-item
            title="颜色"
            item-type="select"
            :selected="themeColorName"
            @click="setColorDialogOpen"
          />
          <mde-list-item
            title="使用系统标题栏(重启后生效)"
            item-type="switch"
            :is-active="settings.useNativeTitleBar"
            @click="onUseNativeTitleBar(!settings.useNativeTitleBar)"
          />
        </mde-list>
      </div>
    </div>

    <div>
      <v-dialog
        v-model="customRegistryPanelVisible"
        persistent
        max-width="500px"
      >
        <v-card color="surface-container-high">
          <v-card-title>自定义 npm 域名</v-card-title>

          <v-card-text>
            <v-text-field
              v-model="customRegistryItem.link"
              label="域名"
              placeholder="https://registry.npmjs.org"
              color="primary"
              :rules="[
                v => v.length > 0,
                v => /^https?:\/\/.*$/.test(v)
              ]"
              @click.right="showTextEditContextMenu"
            />
          </v-card-text>

          <v-card-actions>
            <v-spacer />

            <v-btn
              color="primary"
              @click="setCustomRegistryCancel"
            >
              取消
            </v-btn>

            <v-btn
              color="primary"
              variant="elevated"
              @click="setCustomRegistryConfirm"
            >
              确定
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <v-dialog
        v-model="themeSelectDialogVisible"
        persistent
        max-width="500px"
      >
        <v-card color="surface-container-high">
          <v-card-title>选择主题</v-card-title>

          <v-card-text>
            <mde-list>
              <mde-list-item
                item-type="radio"
                title="明亮"
                :is-active="themeSelectDialogSelected === 'light'"
                @click="themeSelectDialogSelected = 'light'"
              />
              <mde-list-item
                item-type="radio"
                title="暗黑"
                :is-active="themeSelectDialogSelected === 'dark'"
                @click="themeSelectDialogSelected = 'dark'"
              />
              <mde-list-item
                item-type="radio"
                title="系统"
                :is-active="themeSelectDialogSelected === 'system'"
                @click="themeSelectDialogSelected = 'system'"
              />
            </mde-list>
          </v-card-text>

          <v-card-actions>
            <v-spacer />

            <v-btn
              color="primary"
              @click="setThemeDialogCancel"
            >
              取消
            </v-btn>

            <v-btn
              color="primary"
              variant="elevated"
              @click="setThemeDialogConfirm"
            >
              确定
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <v-dialog
        v-model="setColorDialog.visible"
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
                :class="[setColorDialog.selected === 'translime' ? 'rounded-e-4xl' : 'rounded-e-sm']"
                :color="setColorDialog.selected === 'translime' ? 'primary' : 'surface-variant'"
                @click="onSelectThemeColor('translime')"
              >
                默认
              </v-btn>

              <v-btn
                rounded
                :class="[setColorDialog.selected === 'system' ? 'rounded-4xl' : 'rounded-sm']"
                :color="setColorDialog.selected === 'system' ? 'primary' : 'surface-variant'"
                @click="onSelectThemeColor('system')"
              >
                系统
              </v-btn>

              <v-btn
                rounded
                class="rounded-e-4xl"
                :class="[setColorDialog.selected === 'custom' ? 'rounded-s-4xl' : 'rounded-s-sm']"
                :color="setColorDialog.selected === 'custom' ? 'primary' : 'surface-variant'"
                @click="onSelectThemeColor('custom')"
              >
                自定义
              </v-btn>
            </div>

            <v-card
              class="rounded-2xl mt-4"
              variant="flat"
              rounded
              title="颜色来源"
            >
              <template #prepend>
                <color-picker
                  v-model="setColorDialog.customColor"
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
              <v-card
                v-if="setColorDialog.selected === 'translime'"
                class="rounded-2xl"
                link
                variant="outlined"
                rounded
                :color="setColorDialog.selected === 'translime' ? 'primary' : 'outline'"
                @click="onSelectThemeColor('translime')"
              >
                <v-card-text class="relative">
                  <div class="flex flex-col items-center">
                    <div class="flex">
                      <div
                        class="rounded-full w-12 h-12 border-2 border-[rgb(var(--v-theme-surface-container-high))] z-4"
                        :style="{ 'background-color': setColorDialog.translimeThemeColors[store.dark ? 'dark' : 'light'].primary }"
                      />
                      <div
                        class="rounded-full w-12 h-12 border-2 border-[rgb(var(--v-theme-surface-container-high))] -ml-4 z-3"
                        :style="{ 'background-color': setColorDialog.translimeThemeColors[store.dark ? 'dark' : 'light'].secondary }"
                      />
                      <div
                        class="rounded-full w-12 h-12 border-2 border-[rgb(var(--v-theme-surface-container-high))] -ml-4 z-2"
                        :style="{ 'background-color': setColorDialog.translimeThemeColors[store.dark ? 'dark' : 'light'].tertiary }"
                      />
                      <div
                        class="rounded-full w-12 h-12 border-2 border-[rgb(var(--v-theme-surface-container-high))] -ml-4 z-1"
                        :style="{ 'background-color': setColorDialog.translimeThemeColors[store.dark ? 'dark' : 'light'].error }"
                      />
                    </div>

                    <div class="mt-2 text-primary select-none">
                      默认
                    </div>
                  </div>

                  <div
                    v-if="setColorDialog.selected === 'translime'"
                    class="absolute inset-0 flex items-center justify-center z-5"
                  >
                    <div
                      class="w-12 h-12 border-2 border-[rgb(var(--v-theme-surface-container-high))]
                        bg-[rgb(var(--v-theme-primary-container))] rounded-full flex items-center
                        justify-center"
                    >
                      <v-icon class="text-[rgb(var(--v-theme-on-primary-container))]">
                        check
                      </v-icon>
                    </div>
                  </div>
                </v-card-text>
              </v-card>

              <template v-if="setColorDialog.selected === 'custom' && setColorDialog.customThemeList?.length">
                <v-card
                  v-for="customThemeItem in setColorDialog.customThemeList"
                  :key="customThemeItem.variant"
                  class="rounded-2xl"
                  link
                  variant="outlined"
                  rounded
                  :color="setColorDialog.selected === 'custom'
                    && setColorDialog.customColorVariant === customThemeItem.variant ? 'primary' : 'outline'"
                  :disabled="setColorDialog.selected !== 'custom'"
                  @click="onSelectThemeColor('custom', customThemeItem.source, customThemeItem.variant)"
                >
                  <v-card-text class="relative">
                    <div class="flex flex-col items-center">
                      <div class="flex">
                        <div
                          class="rounded-full w-12 h-12 border-2 border-[rgb(var(--v-theme-surface-container-high))] z-4"
                          :style="{ 'background-color': customThemeItem.schemes[store.dark ? 'dark' : 'light'].primary }"
                        />
                        <div
                          class="rounded-full w-12 h-12 border-2 border-[rgb(var(--v-theme-surface-container-high))] -ml-4 z-3"
                          :style="{ 'background-color': customThemeItem.schemes[store.dark ? 'dark' : 'light'].secondary }"
                        />
                        <div
                          class="rounded-full w-12 h-12 border-2 border-[rgb(var(--v-theme-surface-container-high))] -ml-4 z-2"
                          :style="{ 'background-color': customThemeItem.schemes[store.dark ? 'dark' : 'light'].tertiary }"
                        />
                        <div
                          class="rounded-full w-12 h-12 border-2 border-[rgb(var(--v-theme-surface-container-high))] -ml-4 z-1"
                          :style="{ 'background-color': customThemeItem.schemes[store.dark ? 'dark' : 'light'].error }"
                        />
                      </div>

                      <div class="mt-2 text-primary select-none">
                        {{ customThemeItem.variantTitle }}
                      </div>
                    </div>

                    <div
                      v-if="setColorDialog.selected === 'custom' && setColorDialog.customColorVariant === customThemeItem.variant"
                      class="absolute inset-0 flex items-center justify-center z-5"
                    >
                      <div
                        class="w-12 h-12 border-2 border-[rgb(var(--v-theme-surface-container-high))]
                        bg-[rgb(var(--v-theme-primary-container))] rounded-full flex items-center
                        justify-center"
                      >
                        <v-icon class="text-[rgb(var(--v-theme-on-primary-container))]">
                          check
                        </v-icon>
                      </div>
                    </div>
                  </v-card-text>
                </v-card>
              </template>
            </div>
          </v-card-text>

          <v-card-actions>
            <v-spacer />

            <v-btn
              color="primary"
              @click="setColorDialogCancel"
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
    </div>
  </v-container>
</template>

<script setup>
import {
  computed,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import useTheme from '@/hooks/useTheme';
import { useIpc } from '@/hooks/electron';
import useMdColor from '@/hooks/useMdColor';
import useGlobalStore from '@/store/globalStore';
import { appConfigStore, showTextEditContextMenu } from '@/utils';
import MdeList from '@/components/MdeList.vue';
import MdeListItem from '@/components/MdeListItem.vue';
import ColorPicker from '@/components/ColorPicker.vue';

const ipc = useIpc();
const theme = useTheme();
const mdColor = useMdColor();
const store = useGlobalStore();

const registryList = [
  {
    id: 'taobao',
    name: '淘宝镜像',
    link: 'https://registry.npmmirror.com/',
  },
  {
    id: 'npm',
    name: 'npm 官方仓库',
    link: 'https://registry.npmjs.org/',
  },
  {
    id: 'custom',
    name: '自定义',
    link: '',
  },
];
const customRegistryItem = computed(() => registryList.find((item) => item.id === 'custom'));

const customRegistryPanelVisible = ref(false);
const customRegistryPromoteResolve = ref(() => {});
const setAppRegistry = (value) => {
  store.setAppRegistry(value);
};
const onSelectRegistry = async (registry, setType) => {
  if (setType !== 'custom') {
    appConfigStore.set('setting.registry', registry);
    setAppRegistry(registry);
  } else {
    const customRegistryResult = await new Promise((resolve) => {
      customRegistryPromoteResolve.value = resolve;
      customRegistryPanelVisible.value = true;
    });
    if (customRegistryResult) {
      appConfigStore.set('setting.registry', customRegistryItem.value.link);
      setAppRegistry(customRegistryItem.value.link);
    }
  }
};
const setCustomRegistryCancel = () => {
  customRegistryPromoteResolve.value(false);
  customRegistryPanelVisible.value = false;
  customRegistryPromoteResolve.value = () => {};
  customRegistryItem.value.link = '';
};
const setCustomRegistryConfirm = () => {
  customRegistryPromoteResolve.value(true);
  customRegistryPanelVisible.value = false;
  customRegistryPromoteResolve.value = () => {};
};

const setAppOpenAtLogin = (value) => {
  store.setAppOpenAtLogin(value);
};
const onOpenAtLogin = (value) => {
  if (value) {
    // 设置开启开机启动
    ipc.send(ipcType.OPEN_AT_LOGIN, {
      open: true,
    });
  } else {
    // 设置关闭开机启动
    ipc.send(ipcType.OPEN_AT_LOGIN, {
      open: false,
    });
  }
  setAppOpenAtLogin(value);
};

const onShowDevPlugin = (isShow) => {
  ipc.send(ipcType.SHOW_DEV_PLUGIN, {
    isShow: !!isShow,
  });
  store.setShowDevPlugin(!!isShow);
};
const showDevtools = () => {
  ipc.send(ipcType.DEVTOOLS);
};
const relaunch = () => {
  ipc.send(ipcType.RELAUNCH);
};

const initRegistryLink = () => {
  if (!registryList.find((r) => r.link === store.appSetting.registry)) {
    customRegistryItem.value.link = store.appSetting.registry;
  }
};

// 原生标题栏设置
const useNativeTitleBarNext = ref(store.appSetting.useNativeTitleBar);
watch(() => store.appSetting.useNativeTitleBar, () => {
  useNativeTitleBarNext.value = store.appSetting.useNativeTitleBar;
});
const setUseNativeTitleBar = (value) => {
  store.setUseNativeTitleBar(value);
};
const onUseNativeTitleBar = (v) => {
  setUseNativeTitleBar(!!v);
  appConfigStore.set('setting.useNativeTitleBar', !!v);
};

const settings = store.appSetting;
// 主题
const themeMap = {
  light: '明亮',
  dark: '暗黑',
  system: '系统',
};
const currentThemeName = computed(() => themeMap[settings.theme]);
const changeTheme = theme.setTheme;
const themeSelectDialogVisible = ref(false);
const themeSelectDialogSelected = ref(settings.theme);
const setThemeDialogOpen = () => {
  themeSelectDialogVisible.value = true;
};
const setThemeDialogCancel = () => {
  themeSelectDialogVisible.value = false;
  themeSelectDialogSelected.value = settings.theme;
};
const setThemeDialogConfirm = () => {
  themeSelectDialogVisible.value = false;
  changeTheme(themeSelectDialogSelected.value);
};

// 颜色
const variantList = [
  { title: '彩虹', value: 'SchemeRainbow' },
  { title: '多彩活泼', value: 'SchemeFruitSalad' },
  { title: '鲜艳', value: 'SchemeExpressive' },
  { title: '平衡和谐', value: 'SchemeTonalSpot' },
  { title: '高饱和度', value: 'SchemeVibrant' },
  { title: '强调主色', value: 'SchemeContent' },
  { title: '遵循源颜色', value: 'SchemeFidelity' },
  { title: '灰度色彩', value: 'SchemeMonochrome' },
  { title: '中性', value: 'SchemeNeutral' },
];
const themeColorName = computed(() => {
  let name;
  switch (settings.themeColor.name) {
  case 'translime':
    name = '默认';
    break;
  case 'system':
    name = '跟随系统';
    break;
  case 'custom':
  default:
    name = `${settings.themeColor.source} - ${variantList.find((v) => v.value === settings.themeColor.variant).title}`;
    break;
  }
  return name;
});
const setColorDialog = reactive({
  visible: false,
  selected: '',
  customColor: '#000',
  customColorVariant: 'SchemeTonalSpot',
  customThemeList: [],
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
const initCustomThemeColor = () => {
  setColorDialog.selected = settings.themeColor.name;
  setColorDialog.customColor = settings.themeColor.source;
  setColorDialog.customColorVariant = settings.themeColor.variant;
};
const setColorDialogOpen = () => {
  initCustomThemeColor();
  setColorDialog.customThemeList = variantList.map((v) => {
    const themeResult = mdColor.getThemeColorFromColor(setColorDialog.customColor, v.value);
    return {
      variant: v.value,
      variantTitle: v.title,
      source: themeResult.source,
      schemes: themeResult.schemes,
    };
  });
  setColorDialog.visible = true;
};
const onSelectThemeColor = (name, source = null, variant = null) => {
  setColorDialog.selected = name;
  if (source) {
    setColorDialog.customColor = source;
  }
  if (variant) {
    setColorDialog.customColorVariant = variant;
  }
};
const generateRandomColor = () => {
  const randomColor = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
  setColorDialog.customColor = randomColor;
};
const setColorDialogCancel = () => {
  setColorDialog.visible = false;
};
const setColorDialogConfirm = () => {
  const themeColor = {
    name: setColorDialog.selected,
    source: setColorDialog.customColor,
    variant: setColorDialog.customColorVariant,
  };
  const themeColorItem = setColorDialog.customThemeList.find((v) => v.variant === setColorDialog.customColorVariant);
  // 将 M3 配色转换为 Vuetify 兼容格式 (kebab-case) 并合并到主题中，同时保存配置
  const vuetifyColors = mdColor.getVuetifyColors({ schemes: themeColorItem.schemes });
  theme.setCustomTheme(vuetifyColors, themeColor);
  setColorDialog.visible = false;
};
watch(() => setColorDialog.customColor, (color) => {
  setColorDialog.customThemeList = variantList.map((v) => {
    const themeResult = mdColor.getThemeColorFromColor(color, v.value);
    return {
      variant: v.value,
      variantTitle: v.title,
      source: themeResult.source,
      schemes: themeResult.schemes,
    };
  });
});

onMounted(() => {
  initRegistryLink();
  initCustomThemeColor();
});
</script>
