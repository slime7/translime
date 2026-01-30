<template>
  <div class="hdr-capture-settings">
    <v-card flat>
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
            placeholder="例如: Ctrl+Shift+S（留空则通过按钮触发）"
            variant="outlined"
            density="comfortable"
            hint="设置全局快捷键，在任意应用中触发截图"
            persistent-hint
            clearable
            @keydown="onShortcutKeyDown"
            @blur="onShortcutBlur"
            @click:clear="onShortcutClear"
          >
            <template #append>
              <v-btn
                v-if="settings.shortcut"
                color="primary"
                variant="tonal"
                size="small"
                @click="testShortcut"
              >
                测试
              </v-btn>
            </template>
          </v-text-field>
        </div>

        <!-- 保存路径 -->
        <div class="setting-section">
          <v-text-field
            v-model="settings.savePath"
            label="保存路径"
            placeholder="默认为系统图片文件夹"
            variant="outlined"
            density="comfortable"
            readonly
            @click="selectSavePath"
          >
            <template #append>
              <v-btn
                icon="folder_open"
                variant="text"
                @click="selectSavePath"
              />
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
            density="comfortable"
          />
        </div>

        <!-- HDR 设置 -->
        <div class="setting-section">
          <v-switch
            v-model="settings.preserveHdr"
            label="保留 HDR 数据"
            color="primary"
            hint="保存时额外生成包含 HDR 元数据的文件"
            persistent-hint
          />
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
  </div>
</template>

<script setup>
import {
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import {
  getPluginSetting,
  setPluginSetting,
  useDialog,
  useIpc,
} from 'translime-sdk';

defineOptions({
  name: 'HdrCaptureSettings',
});

const PLUGIN_ID = 'translime-plugin-hdr-capture';
const showDebugUi = true;

// 设置状态
const settings = reactive({
  shortcut: '',
  savePath: '',
  saveFormat: 'png',
  preserveHdr: false,
});

// 用于 UI 显示的临时快捷键状态，避免输入过程中频繁触发保存
const tempShortcut = ref('');

// 保存格式选项
const formatOptions = [
  { title: 'PNG（无损）', value: 'png' },
  { title: 'JPEG（有损压缩）', value: 'jpg' },
  { title: 'WebP（高效压缩）', value: 'webp' },
];

// 加载设置
onMounted(async () => {
  const savedSettings = await getPluginSetting(PLUGIN_ID);
  if (savedSettings) {
    Object.assign(settings, savedSettings);
    tempShortcut.value = settings.shortcut; // Initialize tempShortcut
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
      // eslint-disable-next-line no-console
      console.error('获取默认保存路径失败:', err);
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

// 测试快捷键
const testShortcut = () => {
  // 通过 IPC 注册快捷键
  const ipc = useIpc();
  if (ipc) {
    ipc.send(`register-shortcut@${PLUGIN_ID}`, settings.shortcut);
  }
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
    // eslint-disable-next-line no-console
    console.error(err);
  }
};
</script>

<style>
/* 引入 Tailwind CSS utilities，放入 tailwind 图层以与主程序统一 */
@layer tailwind {
  @layer theme, utilities;
  @import "tailwindcss/theme.css" layer(theme);
  @import "tailwindcss/utilities.css" layer(utilities);
}
</style>

<style scoped>
.hdr-capture-settings {
  padding: 16px;
}

.setting-section {
  margin-bottom: 16px;
}
</style>
