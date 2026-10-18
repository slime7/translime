<script setup>
import {
  computed,
  onMounted,
  ref,
  toRaw,
} from 'vue';
import dayjs from 'dayjs';

defineOptions({
  name: 'UiRtmpRecorder',
});

const {
  MatContainer, MatCard, MatCardContent, MatList, MatListItem, MatAvatar,
  MatIcon, MatBtn, MatSpacer, MatTextField, MatSelect, MatProgress, MatBottomSheet,
} = window.mde$.components;
const { alert: showAlert, confirm: showConfirm } = window.mde$.functions;

const useStore = () => {
  const pluginId = 'translime-plugin-rtmp-recorder';
  const url = ref('');
  const saveDir = ref('');
  const otherOptions = ref({
    splitTimeout: 3600,
    saveFilenameTemplate: '[record]_YYYY-MM-DD_HH-mm-ss',
    saveFormat: 'mp4',
    audioCodec: 'copy',
    videoCodec: 'copy',
  });
  const previewFilenameError = ref(false);
  const previewFilenameResult = ref('');
  const tasks = ref([]);
  const recordTaskPanel = ref({
    visible: false,
    taskId: null,
  });
  const currentTaskDetail = computed(() => {
    const task = tasks.value.find((t) => t.taskId === recordTaskPanel.value.taskId);
    return task || null;
  });
  const hasProcessingTasks = computed(() => !!tasks.value.filter((t) => t.isProcessing).length);

  return {
    pluginId,
    url,
    saveDir,
    otherOptions,
    previewFilenameError,
    previewFilenameResult,
    tasks,
    recordTaskPanel,
    currentTaskDetail,
    hasProcessingTasks,
  };
};
const store = useStore();
const {
  url,
  saveDir,
  otherOptions,
  previewFilenameError,
  previewFilenameResult,
  tasks,
  recordTaskPanel,
  currentTaskDetail,
  hasProcessingTasks,
} = store;
const ipc = window.electron.useIpc();
const { showOpenDialog } = window.electron.dialog;
const { getPluginSetting, setPluginSetting } = window.ts;
const getSaveFilenameTemplate = () => dayjs().format(store.otherOptions.value.saveFilenameTemplate);
const getUuiD = (randomLength = 8) => Number(Math.random().toString().substring(2, 2 + randomLength) + +Date.now()).toString(36);

// 主进程按数字判断是否自动分割，文本输入统一收敛为数字后再写回设置
const splitTimeoutInput = computed({
  get: () => String(otherOptions.value.splitTimeout ?? ''),
  set: (value) => {
    const numericValue = Number(value);
    otherOptions.value.splitTimeout = Number.isFinite(numericValue) ? numericValue : 0;
  },
});

const useSelectDir = () => {
  const selectDirError = ref('');
  const openDialog = async (options = {}) => {
    const result = await showOpenDialog(`plugin-window-${store.pluginId}`, {
      properties: ['openDirectory', 'dontAddToRecent'],
      ...options,
    });
    if (result.err) {
      selectDirError.value = '读取文件出错';
    } else if (!result.canceled) {
      [store.saveDir.value] = result.filePaths;
    }
  };

  return {
    error: selectDirError,
    openDialog,
  };
};
const selectDir = useSelectDir();

const useRecord = (state) => {
  const saveOptions = async () => {
    await setPluginSetting(state.pluginId, 'record-setting', {
      url: state.url.value,
      'save-dir': state.saveDir.value,
      'split-timeout': state.otherOptions.value.splitTimeout,
      'save-filename-template': state.otherOptions.value.saveFilenameTemplate,
      'save-format': state.otherOptions.value.saveFormat,
      'audio-codec': state.otherOptions.value.audioCodec,
      'video-codec': state.otherOptions.value.videoCodec,
    });
  };
  const checkOptions = () => {
    if (state.previewFilenameError.value) {
      return '文件模板格式不正确';
    }
    if (!state.url.value) {
      return '请设置直播源';
    }
    if (!state.saveDir.value) {
      return '请设置保存位置';
    }

    return false;
  };
  const getTask = (s, id) => s.tasks.value.find((t) => t.taskId === id);
  const clearCheckProgressTimeout = (taskId) => {
    const task = getTask(state, taskId);
    if (task && task.checkProgressTimer) {
      clearTimeout(task.checkProgressTimer);
      task.checkProgressTimer = null;
    }
  };

  const getOptions = async () => {
    const setting = await getPluginSetting(state.pluginId);
    if (typeof setting?.['record-setting']?.url !== 'undefined') {
      state.url.value = setting['record-setting'].url;
    }
    if (typeof setting?.['record-setting']?.['save-dir'] !== 'undefined') {
      state.saveDir.value = setting['record-setting']['save-dir'];
    }
    if (typeof setting?.['record-setting']?.['split-timeout'] !== 'undefined') {
      state.otherOptions.value.splitTimeout = setting['record-setting']['split-timeout'];
    }
    if (typeof setting?.['record-setting']?.['save-filename-template'] !== 'undefined') {
      state.otherOptions.value.saveFilenameTemplate = setting['record-setting']['save-filename-template'];
    }
    if (typeof setting?.['record-setting']?.['save-format'] !== 'undefined') {
      state.otherOptions.value.saveFormat = setting['record-setting']['save-format'];
    }
    if (typeof setting?.['record-setting']?.['audio-codec'] !== 'undefined') {
      state.otherOptions.value.audioCodec = setting['record-setting']['audio-codec'];
    }
    if (typeof setting?.['record-setting']?.['video-codec'] !== 'undefined') {
      state.otherOptions.value.videoCodec = setting['record-setting']['video-codec'];
    }
  };
  const stop = (taskId) => {
    const task = getTask(state, taskId);
    if (task) {
      task.tryStop = true;
    }
    ipc.send(`stop@${state.pluginId}`, taskId);
  };
  const start = () => {
    const checkResult = checkOptions();
    if (checkResult) {
      showAlert({ title: '出错了', content: checkResult });
      return;
    }
    const taskId = getUuiD();
    const task = {
      taskId,
      recordInfo: {
        url: state.url.value,
        saveDir: state.saveDir.value,
        options: { ...toRaw(state.otherOptions.value), saveFilenameTemplate: getSaveFilenameTemplate() },
      },
      currentProgress: {},
      error: '',
      checkProgressTimer: setTimeout(() => {
        showConfirm({ title: '提示', content: '录制进程30没有返回进度信息，是否强制关闭录制进程已。' })
          .then((result) => {
            if (result) {
              stop(taskId);
            }
          });
      }, 30000),
      stdLines: {
        logs: [],
        latest: '',
        oneLine: true,
      },
      isProcessing: true,
      tryStop: false,
    };
    state.tasks.value.push(task);
    ipc.send(`record@${state.pluginId}`, {
      taskId,
      url: state.url.value,
      saveDir: state.saveDir.value,
      options: { ...toRaw(state.otherOptions.value), saveFilenameTemplate: getSaveFilenameTemplate() },
    });
    saveOptions();
  };
  const remove = (taskId) => {
    const taskIndex = state.tasks.value.findIndex((t) => t.taskId === taskId);
    if (taskIndex > -1 && !state.tasks.value[taskIndex].isProcessing && !state.tasks.value[taskIndex].tryStop) {
      state.tasks.value.splice(taskIndex, 1);
    }
  };
  const showDetailPanel = (id) => {
    state.recordTaskPanel.value.visible = true;
    state.recordTaskPanel.value.taskId = id;
  };

  // 进度
  const onProgress = () => {
    ipc.on(`progress-reply@${state.pluginId}`, ({ taskId, progress }) => {
      const task = getTask(state, taskId);
      if (task) {
        task.currentProgress = progress;
        task.isProcessing = true;
      }
      clearCheckProgressTimeout(taskId);
    });
  };
  // 报错
  const onError = () => {
    ipc.on(`error-reply@${state.pluginId}`, ({ taskId, error: err }) => {
      const task = getTask(state, taskId);
      if (task) {
        task.error = err;
        task.tryStop = false;
        task.isProcessing = false;
      }
      clearCheckProgressTimeout(taskId);
    });
  };
  // 结束
  const onStop = () => {
    ipc.on(`stop-reply@${state.pluginId}`, ({ taskId }) => {
      const task = getTask(state, taskId);
      if (task) {
        task.tryStop = false;
        task.isProcessing = false;
      }
      clearCheckProgressTimeout(taskId);
    });
  };
  // 输出
  const onStd = () => {
    ipc.on(`stderr-reply@${state.pluginId}`, ({ taskId, stderrLine }) => {
      if (!stderrLine || /^\s*$/.test(stderrLine)) {
        return;
      }
      const task = getTask(state, taskId);
      if (task) {
        const progressReg = /\s*frame=.*fps=.*speed=.*/i;
        if (!progressReg.test(task.stdLines.latest) && !progressReg.test(stderrLine)) {
          task.stdLines.logs.push(task.stdLines.latest);
        }
        task.stdLines.latest = stderrLine;
      }
    });
  };

  const onQuickSelectSplitTimeout = (val) => {
    store.otherOptions.value.splitTimeout = val;
  };

  return {
    getOptions,
    start,
    stop,
    remove,
    showDetailPanel,
    onProgress,
    onError,
    onStop,
    onStd,
    onQuickSelectSplitTimeout,
  };
};
const record = useRecord(store);

const getPreviewFilename = () => {
  store.previewFilenameError.value = false;
  let formattedFilename = getSaveFilenameTemplate();
  const ffStringTempReg = /%(\d*)d/;
  if (store.otherOptions.value.splitTimeout > 0) {
    formattedFilename += '_000';
  }
  if (formattedFilename.match(ffStringTempReg)?.length) {
    store.previewFilenameError.value = true;
    store.previewFilenameResult.value = '';
    return;
  }
  store.previewFilenameResult.value = `${formattedFilename}.${store.otherOptions.value.saveFormat}`;
};

const selectSaveDir = async () => {
  await selectDir.openDialog();
};

onMounted(() => {
  record.onProgress();
  record.onError();
  record.onStop();
  record.onStd();
  record.getOptions();
});
</script>

<template>
  <mat-container class="plugin-main">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <mat-card
        v-for="task in tasks"
        :key="task.taskId"
        class="rounded-2xl cursor-pointer"
        @click="record.showDetailPanel(task.taskId)"
      >
        <mat-list>
          <mat-list-item lines="2">
            <template #leading>
              <mat-avatar color="primary">
                <mat-progress v-if="task.isProcessing" variant="circular" indeterminate :size="24" />
                <mat-icon v-else icon="done" />
              </mat-avatar>
            </template>

            <template #trailing>
              <mat-btn
                v-if="!task.isProcessing"
                icon="close"
                label="移除任务"
                variant="text"
                size="small"
                @click.stop="record.remove(task.taskId)"
              />
              <mat-btn
                v-else
                icon="stop"
                label="停止任务"
                variant="text"
                size="small"
                @click.stop="record.stop(task.taskId)"
              />
            </template>

            <span :title="task.recordInfo.url">{{ task.recordInfo.url }}</span>

            <template #supporting>
              <template v-if="!task.error">
                <span>时长：</span>
                <span v-text="task.currentProgress?.timemark" />
                <span class="ml-2">frames：</span>
                <span v-text="task.currentProgress?.frames" />
                <span class="ml-2">fps：</span>
                <span v-text="task.currentProgress?.currentFps" />
              </template>
              <span v-else :title="task.error">{{ task.error }}</span>
            </template>
          </mat-list-item>
        </mat-list>
      </mat-card>
    </div>

    <mat-card class="rounded-2xl">
      <mat-list>
        <mat-list-item>
          <template #leading>
            <mat-avatar color="primary">
              <mat-icon icon="radio_button_checked" />
            </mat-avatar>
          </template>

          填写直播源开始录制
        </mat-list-item>
      </mat-list>

      <mat-card-content>
        <div>
          <!-- todo: 选择直播平台填入房间号自动获取直播源，原直播源选项放入自定义选项中 -->
          <mat-text-field
            v-model="url"
            class="w-full"
            color="primary"
            label="直播源"
            placeholder="设置直播来源"
          />
        </div>

        <div class="mt-4">
          <mat-text-field
            v-model="saveDir"
            class="w-full"
            color="primary"
            label="保存文件夹"
            readonly
            @click="selectSaveDir"
          >
            <template #trailing>
              <mat-btn
                icon="folder_open"
                label="选择保存文件夹"
                variant="text"
                size="small"
                @click.stop="selectSaveDir"
              />
            </template>
          </mat-text-field>
        </div>

        <div class="flex items-center mt-4">
          <mat-spacer />

          <mat-btn
            v-if="hasProcessingTasks"
            class="mr-4"
            color="primary"
            variant="outlined"
            @click="record.stop()"
          >
            全部停止
          </mat-btn>

          <mat-btn
            class="mr-4"
            color="primary"
            @click="record.start"
          >
            持续录制
          </mat-btn>

          <mat-btn
            color="primary"
            @click="record.start"
          >
            一次性录制
          </mat-btn>
        </div>
      </mat-card-content>
    </mat-card>

    <mat-card class="mt-4 rounded-2xl">
      <mat-list>
        <mat-list-item>
          <template #leading>
            <mat-avatar color="primary">
              <mat-icon icon="settings" />
            </mat-avatar>
          </template>

          设置更多录制参数
        </mat-list-item>
      </mat-list>

      <mat-card-content>
        <div class="grid grid-cols-2 gap-4">
          <mat-text-field
            v-model="splitTimeoutInput"
            class="w-full"
            color="primary"
            label="自动分割(单位：秒)"
            placeholder="设置自动分割间隔"
          />

          <mat-select
            v-model="otherOptions.splitTimeout"
            class="w-full"
            color="primary"
            label="快捷选择自动分割"
            :items="[
              { title: '不分割', value: 0 },
              { title: '1分钟', value: 60 },
              { title: '2分钟', value: 120 },
              { title: '3分钟', value: 180 },
              { title: '5分钟', value: 300 },
              { title: '10分钟', value: 600 },
              { title: '15分钟', value: 900 },
              { title: '20分钟', value: 1200 },
              { title: '30分钟', value: 1800 },
              { title: '45分钟', value: 2700 },
              { title: '1小时', value: 3600 },
              { title: '2小时', value: 7200 },
            ]"
            @update:model-value="record.onQuickSelectSplitTimeout"
          />
        </div>

        <div class="grid grid-cols-2 gap-4 mt-4">
          <mat-text-field
            v-model="otherOptions.audioCodec"
            class="w-full"
            color="primary"
            label="音频编码"
            placeholder="设置音频编码"
          />

          <mat-text-field
            v-model="otherOptions.videoCodec"
            class="w-full"
            color="primary"
            label="视频编码"
            placeholder="设置视频编码"
          />
        </div>

        <div class="grid grid-cols-2 gap-4 mt-4">
          <mat-text-field
            v-model="otherOptions.saveFilenameTemplate"
            class="w-full"
            color="primary"
            label="保存文件名模板"
            :supporting-text="`预览：${previewFilenameResult}`"
            :error="previewFilenameError"
            :error-text="previewFilenameError ? '文件模板格式不正确' : undefined"
            @update:model-value="getPreviewFilename"
            @focus="getPreviewFilename"
          />

          <mat-select
            v-model="otherOptions.saveFormat"
            class="w-full"
            color="primary"
            label="视频格式"
            placeholder="选择要保存的视频格式"
            :items="[
              { title: 'MPEG-4(.mp4)', value: 'mp4' },
              { title: 'Flash Video(.flv)', value: 'flv' },
              { title: 'QuickTime(.mov)', value: 'mov' },
              { title: 'Matroska(.mkv)', value: 'mkv' },
            ]"
          />
        </div>
      </mat-card-content>
    </mat-card>

    <mat-bottom-sheet
      v-model="recordTaskPanel.visible"
      variant="modal"
      expanded="max"
    >
      <div
        v-if="currentTaskDetail"
        class="flex flex-col min-h-0 h-full"
      >
        <div class="shrink-0">
          <mat-list>
            <mat-list-item lines="2">
              <template #leading>
                <mat-avatar color="primary">
                  <mat-progress v-if="currentTaskDetail.isProcessing" variant="circular" indeterminate :size="24" />
                  <mat-icon v-else icon="done" />
                </mat-avatar>
              </template>

              <span :title="currentTaskDetail.recordInfo.url">{{ currentTaskDetail.recordInfo.url }}</span>

              <template #supporting>
                <template v-if="!currentTaskDetail.error">
                  <span>时长：</span>
                  <span v-text="currentTaskDetail.currentProgress?.timemark" />
                  <span class="ml-2">frames：</span>
                  <span v-text="currentTaskDetail.currentProgress?.frames" />
                  <span class="ml-2">fps：</span>
                  <span v-text="currentTaskDetail.currentProgress?.currentFps" />
                </template>
                <span v-else :title="currentTaskDetail.error">{{ currentTaskDetail.error }}</span>
              </template>
            </mat-list-item>
          </mat-list>
        </div>

        <div class="grow overflow-auto min-h-0 p-4">
          <p>录制源：{{ currentTaskDetail.recordInfo.url }}</p>
          <p>保存位置：{{ currentTaskDetail.recordInfo.saveDir }}</p>

          <div
            v-if="currentTaskDetail.stdLines.latest || currentTaskDetail.stdLines.logs.length"
            class="mt-4 rounded bg-record-console"
          >
            <pre
              class="log-area p-2"
              :class="{ 'one-line': currentTaskDetail.stdLines.oneLine }"
            ><span
              v-for="(line, index) in currentTaskDetail.stdLines.logs"
              :key="index"
              v-text="`${line}\n`"
            /><span
              class="latest-line"
              v-text="currentTaskDetail.stdLines.latest"
            /></pre>
          </div>

          <div class="mt-4 flex">
            <mat-spacer />

            <mat-btn
              v-if="currentTaskDetail.stdLines.latest || currentTaskDetail.stdLines.logs.length"
              class="mr-4"
              color="primary"
              variant="outlined"
              @click="currentTaskDetail.stdLines.oneLine = !currentTaskDetail.stdLines.oneLine"
            >
              切换输出窗口
            </mat-btn>
          </div>
        </div>
      </div>
    </mat-bottom-sheet>
  </mat-container>
</template>

<style>
/* 引入 Tailwind CSS utilities，放入 tailwind 图层以与主程序统一 */
@layer tailwind {
  @layer theme, utilities;
  @import "tailwindcss/theme.css" layer(theme);
  @import "tailwindcss/utilities.css" layer(utilities);
}
</style>

<style scoped>
.bg-record-console {
  background: #300a24;
}

.log-area {
  max-height: 280px;
  color: #eeeeec;
  overflow: auto;
  overscroll-behavior: none;
  font-family: "Source Code Pro", monospace;
}

.log-area.one-line span {
  display: none;
}

.log-area.one-line span.latest-line {
  display: inline;
}

::-webkit-scrollbar {
  width: 16px;
  background-color: transparent;
}

::-webkit-scrollbar-thumb {
  height: 56px;
  border-radius: 8px;
  border: 4px solid transparent;
  background-clip: content-box;
  background-color: #606060;
}
</style>
