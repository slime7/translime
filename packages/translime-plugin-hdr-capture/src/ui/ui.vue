<template>
  <v-container class="plugin-main hdr-capture-settings">
    <v-card
      class="rounded-3xl"
      rounded
    >
      <v-card-title class="text-h6">
        <v-icon start>
          camera
        </v-icon>
        HDR 截图工具设置
      </v-card-title>

      <v-card-text>
        <!-- 快捷键设置 -->
        <div class="setting-section">
          <v-text-field
            v-model="tempShortcut"
            label="截图快捷键"
            placeholder="例如: Ctrl+Alt+A（留空则通过按钮触发）"
            variant="outlined"
            color="primary"
            density="comfortable"
            hint="设置全局快捷键，在任意应用中触发截图"
            persistent-hint
            clearable
            @keydown="onShortcutKeyDown"
            @blur="onShortcutBlur"
            @click:clear="onShortcutClear"
          />
        </div>

        <!-- 保存路径 -->
        <div class="setting-section">
          <v-text-field
            v-model="settings.savePath"
            label="保存路径"
            placeholder="默认为系统图片文件夹"
            variant="outlined"
            color="primary"
            density="comfortable"
            readonly
            @click="selectSavePath"
          >
            <template #append>
              <v-btn
                icon="folder_open"
                variant="text"
                @click.stop="selectSavePath"
              />
            </template>
          </v-text-field>
        </div>

        <!-- 保存文件名 -->
        <div class="setting-section">
          <v-text-field
            v-model="settings.saveFilenameTemplate"
            label="保存文件名"
            placeholder="例如: [DD]_YYYY-MM-DD_HH-mm-ss"
            variant="outlined"
            color="primary"
            density="comfortable"
            :hint="`预览：${previewFilenameResult}`"
            persistent-hint
            clearable
          >
            <template #append-inner>
              <v-tooltip
                location="bottom"
                open-on-click
              >
                <template #activator="{ props }">
                  <v-icon
                    v-bind="props"
                    icon="help_outline"
                    size="small"
                    class="mr-2 cursor-pointer"
                  />
                </template>
                <div class="text-caption">
                  <div class="mb-2">
                    日期变量说明：
                  </div>
                  <div>使用 dayjs 日期格式</div>
                  <div>YYYY - 年份 (e.g. 2024)</div>
                  <div>MM - 月份 (01-12)</div>
                  <div>DD - 日期 (01-31)</div>
                  <div>HH - 小时 (00-23)</div>
                  <div>mm - 分钟 (00-59)</div>
                  <div>ss - 秒 (00-59)</div>
                  <div class="mt-2">
                    留空则使用默认时间戳格式
                  </div>
                </div>
              </v-tooltip>
            </template>
          </v-text-field>
        </div>

        <!-- 保存格式 -->
        <div class="setting-section">
          <v-select
            v-model="settings.saveFormat"
            :items="formatOptions"
            label="保存格式"
            variant="outlined"
            color="primary"
            density="comfortable"
          />
        </div>

        <!-- 响应速度设置 -->
        <div class="setting-section">
          <v-switch
            v-model="settings.fastResponse"
            label="快速响应模式"
            color="primary"
          >
            <template #append>
              <v-tooltip
                location="bottom"
                text="开启后常驻后台，极大缩短截图响应时间 (推荐)"
              >
                <template #activator="{ props }">
                  <v-icon
                    v-bind="props"
                    icon="help_outline"
                    size="small"
                    class="ml-2"
                  />
                </template>
              </v-tooltip>
            </template>
          </v-switch>
        </div>

        <!-- HDR 映射设置组 -->
        <div class="setting-section">
          <v-switch
            v-model="settings.enableHdrMapping"
            label="启用 HDR 映射"
            color="primary"
          >
            <template #append>
              <v-tooltip
                location="bottom"
                text="对 HDR 屏幕应用自定义的色调映射参数"
              >
                <template #activator="{ props }">
                  <v-icon
                    v-bind="props"
                    icon="help_outline"
                    size="small"
                    class="ml-2"
                  />
                </template>
              </v-tooltip>
            </template>
          </v-switch>

          <!-- HDR 映射子设置，仅在启用时显示 -->
          <v-expand-transition>
            <div
              v-show="settings.enableHdrMapping"
              class="hdr-mapping-options mt-4 ml-4"
            >
              <!-- SDR 输出最大值 -->
              <div class="slider-setting mb-4">
                <div class="slider-header">
                  <span class="slider-label">SDR 输出最大值</span>
                  <v-chip
                    size="small"
                    color="primary"
                    variant="tonal"
                  >
                    {{ sliderState.sdrWhiteNits }} nits
                  </v-chip>
                </div>
                <v-slider
                  v-model="sliderState.sdrWhiteNits"
                  :min="80"
                  :max="400"
                  :step="1"
                  color="primary"
                  thumb-label
                  hide-details
                  @end="settings.sdrWhiteNits = sliderState.sdrWhiteNits"
                >
                  <template #prepend>
                    <span class="slider-range-label">80</span>
                  </template>
                  <template #append>
                    <span class="slider-range-label">400</span>
                  </template>
                </v-slider>
                <div class="slider-hint text-caption text-grey">
                  Windows 默认 SDR 白点约为 203 nits
                </div>
              </div>

              <!-- HDR 输入最大值 -->
              <div class="slider-setting mb-4">
                <div class="slider-header">
                  <span class="slider-label">HDR 输入最大值</span>
                  <v-chip
                    size="small"
                    color="primary"
                    variant="tonal"
                  >
                    {{ sliderState.hdrMaxNits }} nits
                  </v-chip>
                </div>
                <v-slider
                  v-model="sliderState.hdrMaxNits"
                  :min="400"
                  :max="2000"
                  :step="10"
                  color="primary"
                  thumb-label
                  hide-details
                  @end="settings.hdrMaxNits = sliderState.hdrMaxNits"
                >
                  <template #prepend>
                    <span class="slider-range-label">400</span>
                  </template>
                  <template #append>
                    <span class="slider-range-label">2000</span>
                  </template>
                </v-slider>
                <div class="slider-hint text-caption text-grey">
                  HDR 内容的最大输入亮度，通常为 1000 nits
                </div>
              </div>

              <!-- 保存 HDR 原始文件 -->
              <v-switch
                v-model="settings.preserveHdr"
                label="保存 HDR 原始文件"
                color="primary"
                density="compact"
              />
            </div>
          </v-expand-transition>
        </div>

        <v-divider class="my-4" />
        <!-- 操作按钮 -->
        <div class="action-buttons mt-6 flex gap-x-2">
          <v-btn
            class="grow"
            color="primary"
            size="large"
            @click="startCapture()"
          >
            <v-icon start>
              camera
            </v-icon>
            开始截图
          </v-btn>

          <v-btn
            v-if="showDebugUi"
            class="shrink-none"
            color="primary"
            size="large"
            @click="startCapture(true)"
          >
            overlay debug
          </v-btn>
        </div>
      </v-card-text>
    </v-card>
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
import dayjs from 'dayjs';
import {
  getPluginSetting,
  setPluginSetting,
  useDialog,
  useIpc,
  useLogger,
} from 'translime-sdk';

defineOptions({
  name: 'HdrCaptureSettings',
});

const PLUGIN_ID = 'translime-plugin-hdr-capture';
const showDebugUi = true;
const baseLogger = useLogger();
const logger = baseLogger.child ? baseLogger.child({ plugin_id: PLUGIN_ID, context: 'SettingsUI' }) : baseLogger;

// 设置状态
const settings = reactive({
  shortcut: '',
  savePath: '',
  saveFilenameTemplate: '[HDR_Capture]_YYYY-MM-DD_HH-mm-ss', // 保存文件名模板
  saveFormat: 'png',
  fastResponse: true, // 快速响应模式 (Keep-Alive)
  // HDR 映射设置
  enableHdrMapping: true, // 是否启用自定义 HDR 映射
  sdrWhiteNits: 203, // SDR 白点亮度 (默认 Windows 标准)
  hdrMaxNits: 1000, // HDR 峰值亮度 (默认 1000 nits)
  preserveHdr: false, // 是否保存 HDR 原始文件
});

// 滑块临时状态（防抖）
const sliderState = reactive({
  sdrWhiteNits: 203,
  hdrMaxNits: 1000,
});

// 用于 UI 显示的临时快捷键状态，避免输入过程中频繁触发保存
const tempShortcut = ref('');

// 保存格式选项
const formatOptions = [
  { title: 'PNG（无损）', value: 'png' },
  { title: 'JPEG（有损压缩）', value: 'jpg' },
  { title: 'WebP（高效压缩）', value: 'webp' },
];

const previewFilenameResult = computed(() => {
  if (!settings.saveFilenameTemplate) {
    return `默认: ${dayjs().format('[HDR_Capture]_YYYY-MM-DD_HH-mm-ss')}.${settings.saveFormat}`;
  }
  try {
    return `${dayjs().format(settings.saveFilenameTemplate)}.${settings.saveFormat}`;
  } catch (e) {
    return '格式错误';
  }
});

// 加载设置
onMounted(async () => {
  const savedSettings = await getPluginSetting(PLUGIN_ID);
  if (savedSettings) {
    Object.assign(settings, savedSettings);
    tempShortcut.value = settings.shortcut; // Initialize tempShortcut

    // 初始化滑块临时状态
    sliderState.sdrWhiteNits = settings.sdrWhiteNits;
    sliderState.hdrMaxNits = settings.hdrMaxNits;
  }

  // 如果保存路径为空，获取默认路径并填入（但不强制保存，除非用户修改了其他设置）
  if (!settings.savePath) {
    const ipc = useIpc();
    try {
      const defaultPath = await ipc.invoke(`get-default-save-path@${PLUGIN_ID}`);
      if (defaultPath) {
        settings.savePath = defaultPath;
      }
    } catch (err) {
      logger.error('获取默认保存路径失败:', err);
    }
  }
});

// 监听设置变化，自动保存
watch(settings, async (newSettings) => {
  await setPluginSetting(PLUGIN_ID, { ...newSettings });
}, { deep: true });

// 快捷键输入处理
const onShortcutKeyDown = (e) => {
  e.preventDefault();

  const keys = [];
  if (e.ctrlKey) keys.push('Ctrl');
  if (e.altKey) keys.push('Alt');
  if (e.shiftKey) keys.push('Shift');
  if (e.metaKey) keys.push('Super');

  const isModifierOnly = ['Control', 'Alt', 'Shift', 'Meta'].includes(e.key);

  // 获取主键
  if (e.key && !isModifierOnly) {
    keys.push(e.key.toUpperCase());
  }

  const currentDisplay = keys.join('+');
  tempShortcut.value = currentDisplay;

  // 只有当包含非修饰键或者是有效的组合键时，才尝试更新到正式设置
  // 单独按修饰键时不更新正式设置，防止主进程注册失败
  if (keys.length > 0 && !isModifierOnly) {
    settings.shortcut = currentDisplay;
  }
};

const onShortcutBlur = () => {
  // 失去焦点时，确保显示的内容与实际保存的内容同步
  tempShortcut.value = settings.shortcut;
};

const onShortcutClear = () => {
  settings.shortcut = '';
  tempShortcut.value = '';
};

// 选择保存路径
const selectSavePath = async () => {
  const dialog = useDialog();
  if (dialog) {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      [settings.savePath] = result.filePaths;
    }
  }
};

// 开始截图
const startCapture = async (isDebug = false) => {
  const ipc = useIpc();
  try {
    await ipc.invoke(`start-capture@${PLUGIN_ID}`, { isDebug });
  } catch (err) {
    logger.error(err);
  }
};
</script>

<style>
/* 引入 Tailwind CSS utilities，放入 tailwind 图层以与主程序统一 */
@layer tailwind {
  @layer theme, utilities;
  @import 'tailwindcss/theme.css' layer(theme);
  @import 'tailwindcss/utilities.css' layer(utilities);
}
</style>

<style scoped>
.hdr-capture-settings {
  padding: 16px;
}

.setting-section {
  margin-bottom: 16px;
}

/* HDR 映射设置样式 */
.hdr-mapping-options {
  padding-left: 16px;
}

.slider-setting {
  padding: 8px 0;
}

.slider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.slider-label {
  font-size: .875rem;
  font-weight: 500;
}

.slider-range-label {
  font-size: .75rem;
  color: rgb(var(--v-theme-on-surface) / 60%);
  min-width: 32px;
  text-align: center;
}

.slider-hint {
  margin-top: 4px;
  opacity: .7;
}
</style>
