<template>
  <div class="plugin-main hdr-capture-settings">
    <mat-card
      class="settings-card"
      variant="elevated"
    >
      <template #headline>
        <div class="flex items-center gap-2">
          <mat-icon
            icon="camera"
            aria-hidden="true"
          />
          <span>HDR 截图工具设置</span>
        </div>
      </template>

      <mat-card-content>
        <!-- 快捷键设置 -->
        <div class="setting-section">
          <mat-text-field
            v-model="tempShortcut"
            class="w-full"
            label="截图快捷键"
            placeholder="例如: Ctrl+Alt+A（留空则通过按钮触发）"
            variant="outlined"
            color="primary"
            supporting-text="设置全局快捷键，在任意应用中触发截图"
            @keydown="onShortcutKeyDown"
            @blur="onShortcutBlur"
          >
            <template #trailing>
              <mat-btn
                v-if="tempShortcut"
                icon="close"
                variant="standard"
                size="small"
                aria-label="清除快捷键"
                @click.stop="onShortcutClear"
              />
            </template>
          </mat-text-field>
        </div>

        <!-- 保存路径 -->
        <div class="setting-section">
          <mat-text-field
            v-model="settings.savePath"
            class="w-full"
            label="保存路径"
            placeholder="默认为系统图片文件夹"
            variant="outlined"
            color="primary"
            readonly
            @click="selectSavePath"
          >
            <template #trailing>
              <mat-btn
                icon="folder_open"
                variant="standard"
                size="small"
                aria-label="选择保存路径"
                @click.stop="selectSavePath"
              />
            </template>
          </mat-text-field>
        </div>

        <!-- 保存文件名 -->
        <div class="setting-section">
          <mat-text-field
            v-model="settings.saveFilenameTemplate"
            class="w-full"
            label="保存文件名"
            placeholder="例如: [DD]_YYYY-MM-DD_HH-mm-ss"
            variant="outlined"
            color="primary"
            :supporting-text="`预览：${previewFilenameResult}`"
          >
            <template #trailing>
              <mat-tooltip
                rich
                location="bottom"
              >
                <template #activator>
                  <mat-icon
                    icon="help"
                    class="mr-2 cursor-pointer"
                    aria-label="日期变量说明"
                  />
                </template>
                <template #subhead>
                  日期变量说明
                </template>
                <div>使用 dayjs 日期格式</div>
                <div>YYYY - 年份 (e.g. 2024)</div>
                <div>MM - 月份 (01-12)</div>
                <div>DD - 日期 (01-31)</div>
                <div>HH - 小时 (00-23)</div>
                <div>mm - 分钟 (00-59)</div>
                <div>ss - 秒 (00-59)</div>
                <div class="mt-1">
                  留空则使用默认时间戳格式
                </div>
              </mat-tooltip>
            </template>
          </mat-text-field>
        </div>

        <!-- 保存格式 -->
        <div class="setting-section">
          <mat-select
            v-model="settings.saveFormat"
            class="w-full"
            :items="formatOptions"
            label="保存格式"
            variant="outlined"
            color="primary"
          />
        </div>

        <!-- 响应速度设置 -->
        <div class="setting-section">
          <div class="flex items-center">
            <mat-switch
              v-model="settings.fastResponse"
              color="primary"
            >
              快速响应模式
            </mat-switch>
            <mat-tooltip content="开启后常驻后台，极大缩短截图响应时间 (推荐)">
              <template #activator>
                <mat-icon
                  icon="help"
                  class="ml-2 cursor-pointer"
                  aria-label="快速响应模式说明"
                />
              </template>
            </mat-tooltip>
          </div>
        </div>

        <!-- 捕获鼠标 -->
        <div class="setting-section">
          <mat-switch
            v-model="settings.captureCursor"
            color="primary"
          >
            捕获鼠标
          </mat-switch>
        </div>

        <!-- HDR 映射设置组 -->
        <div class="setting-section">
          <div class="flex items-center">
            <mat-switch
              v-model="settings.enableHdrMapping"
              color="primary"
            >
              启用 HDR 映射
            </mat-switch>
            <mat-tooltip content="对 HDR 屏幕应用自定义的色调映射参数">
              <template #activator>
                <mat-icon
                  icon="help"
                  class="ml-2 cursor-pointer"
                  aria-label="启用 HDR 映射说明"
                />
              </template>
            </mat-tooltip>
          </div>

          <!-- HDR 映射子设置，仅在启用时显示 -->
          <mat-expand-transition>
            <div
              v-show="settings.enableHdrMapping"
              class="hdr-mapping-options ml-4"
            >
              <!-- SDR 输出最大值 -->
              <div class="slider-setting mb-4">
                <div class="slider-header">
                  <span class="slider-label">SDR 输出最大值</span>
                  <div class="flex items-center gap-2">
                    <mat-chip
                      variant="assist"
                      color="primary"
                    >
                      {{ sliderState.sdrWhiteNits }} nits
                    </mat-chip>
                    <mat-btn
                      size="small"
                      variant="text"
                      color="primary"
                      :loading="systemSdrWhiteLoading"
                      @click="applySystemSdrWhiteNits"
                    >
                      使用系统值
                    </mat-btn>
                  </div>
                </div>
                <mat-slider
                  v-model="sliderState.sdrWhiteNits"
                  aria-label="SDR 输出最大值"
                  :min="80"
                  :max="400"
                  :step="1"
                  color="primary"
                  show-value-indicator
                  @change="settings.sdrWhiteNits = sliderState.sdrWhiteNits"
                >
                  <template #prepend>
                    <span class="slider-range-label">80</span>
                  </template>
                  <template #append>
                    <span class="slider-range-label">400</span>
                  </template>
                </mat-slider>
                <div class="slider-hint">
                  {{ systemSdrWhiteHint }}
                </div>
              </div>

              <!-- HDR 输入最大值 -->
              <div class="slider-setting mb-4">
                <div class="slider-header">
                  <span class="slider-label">HDR 输入最大值</span>
                  <mat-chip
                    variant="assist"
                    color="primary"
                  >
                    {{ sliderState.hdrMaxNits }} nits
                  </mat-chip>
                </div>
                <mat-slider
                  v-model="sliderState.hdrMaxNits"
                  aria-label="HDR 输入最大值"
                  :min="400"
                  :max="2000"
                  :step="10"
                  color="primary"
                  show-value-indicator
                  @change="settings.hdrMaxNits = sliderState.hdrMaxNits"
                >
                  <template #prepend>
                    <span class="slider-range-label">400</span>
                  </template>
                  <template #append>
                    <span class="slider-range-label">2000</span>
                  </template>
                </mat-slider>
                <div class="slider-hint">
                  HDR 内容的最大输入亮度，通常为你的显示器标称值
                </div>
              </div>

              <!-- 保存 HDR 原始文件 -->
              <mat-switch
                v-model="settings.preserveHdr"
                color="primary"
              >
                保存 HDR 原始文件
              </mat-switch>
            </div>
          </mat-expand-transition>
        </div>

        <mat-divider class="my-4" />
        <!-- 操作按钮 -->
        <div class="action-buttons mt-6 flex gap-x-2">
          <mat-btn
            class="grow"
            variant="filled"
            color="primary"
            size="large"
            prefix="camera"
            @click="startCapture()"
          >
            开始截图
          </mat-btn>

          <mat-btn
            v-if="showDebugUi"
            class="shrink-0"
            variant="filled"
            color="primary"
            size="large"
            @click="startCapture(true)"
          >
            overlay debug
          </mat-btn>
        </div>
      </mat-card-content>
    </mat-card>
  </div>
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
const showDebugUi = false;
const baseLogger = useLogger();
const logger = baseLogger.child ? baseLogger.child({ plugin_id: PLUGIN_ID, context: 'SettingsUI' }) : baseLogger;
const ipc = useIpc();

// 设置状态
const settings = reactive({
  shortcut: '',
  savePath: '',
  saveFilenameTemplate: '[HDR_Capture]_YYYY-MM-DD_HH-mm-ss', // 保存文件名模板
  saveFormat: 'png',
  fastResponse: true, // 快速响应模式 (Keep-Alive)
  captureCursor: false, // 是否捕获鼠标
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
const systemSdrWhiteLoading = ref(false);
const systemSdrWhiteNits = ref(null);
const systemSdrWhiteSource = ref('');

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

const systemSdrWhiteHint = computed(() => {
  if (systemSdrWhiteLoading.value) {
    return '正在读取系统 SDR 白点...';
  }
  if (typeof systemSdrWhiteNits.value === 'number') {
    const hdrState = systemSdrWhiteSource.value ? `，${systemSdrWhiteSource.value}` : '';
    return `系统当前 SDR 白点约为 ${systemSdrWhiteNits.value.toFixed(0)} nits${hdrState}。点击“使用系统值”可覆盖当前手动设置。`;
  }
  return '手动调整 SDR 白点；也可以点击“使用系统值”读取并覆盖当前设置。';
});

const loadSystemSdrWhiteNits = async () => {
  systemSdrWhiteLoading.value = true;
  try {
    const info = await ipc.invoke(`get-system-sdr-white-nits@${PLUGIN_ID}`);
    if (info && typeof info.sdrWhiteNits === 'number') {
      systemSdrWhiteNits.value = info.sdrWhiteNits;
      systemSdrWhiteSource.value = info.hdrEnabled ? '当前主屏为 HDR 模式' : '当前主屏为 SDR 模式';
      return info.sdrWhiteNits;
    }
  } catch (err) {
    logger.error('读取系统 SDR 白点失败:', err);
  } finally {
    systemSdrWhiteLoading.value = false;
  }

  systemSdrWhiteNits.value = null;
  systemSdrWhiteSource.value = '';
  return null;
};

const applySystemSdrWhiteNits = async () => {
  const nits = await loadSystemSdrWhiteNits();
  if (typeof nits === 'number') {
    const rounded = Math.round(nits);
    sliderState.sdrWhiteNits = rounded;
    settings.sdrWhiteNits = rounded;
  }
};

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

  await loadSystemSdrWhiteNits();

  // 如果保存路径为空，获取默认路径并填入（但不强制保存，除非用户修改了其他设置）
  if (!settings.savePath) {
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

.settings-card {
  padding: 4px;
}

.setting-section {
  margin-bottom: 16px;
}

/* HDR 映射设置样式 */
/* 折叠内容根元素用内边距承载纵向间距，避免折叠首尾跳变 */
.hdr-mapping-options {
  padding-left: 16px;
  padding-top: 16px;
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
  color: var(--mat-sys-color-on-surface-variant);
  min-width: 32px;
  text-align: center;
}

.slider-hint {
  margin-top: 4px;
  font-size: .75rem;
  color: var(--mat-sys-color-on-surface-variant);
  opacity: .8;
}
</style>
