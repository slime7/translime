<template>
  <mat-container class="log-viewer">
    <div class="log-viewer__container">
      <div class="log-viewer__title text-center text-mat-headline-large">
        日志
      </div>

      <mat-card class="rounded-3xl mt-4">
        <mat-card-content>
          <div class="log-viewer__toolbar">
            <mat-select
              v-model="selectedDate"
              :items="dateOptions"
              label="日期"
              variant="outlined"
              class="log-viewer__date-select"
              :disabled="loading || !dateOptions.length"
            />

            <mat-select
              v-model="selectedLevels"
              :items="levelOptions"
              label="级别"
              variant="outlined"
              multiple
              class="log-viewer__level-select"
            />

            <div class="log-viewer__toolbar-actions">
              <mat-btn
                color="primary"
                :loading="loading"
                @click="refreshLogs"
              >
                刷新
              </mat-btn>

              <mat-btn
                variant="filled-tonal"
                :disabled="!hasLogDir"
                @click="openLogDir"
              >
                打开日志目录
              </mat-btn>
            </div>
          </div>

          <div class="log-viewer__status text-mat-body-medium text-on-surface-variant">
            {{ statusText }}
          </div>

          <div
            v-if="errorMessage"
            class="mt-4 px-4 py-3 rounded-lg bg-error-container text-on-error-container"
          >
            {{ errorMessage }}
          </div>
        </mat-card-content>
      </mat-card>

      <div
        class="log-viewer__records"
        data-test="log-records-container"
      >
        <mat-virtual-scroll
          ref="virtualScrollRef"
          :items="filteredRecords"
          item-key="id"
          :estimated-item-height="150"
        >
          <template #default="{ item, itemRef }">
            <div
              :ref="itemRef"
              class="log-viewer__record-slot"
            >
              <mat-card
                data-test="log-record-card"
                class="rounded-3xl"
              >
                <mat-card-content>
                  <div class="log-viewer__record">
                    <div class="log-viewer__record-main">
                      <div class="log-viewer__record-meta">
                        <mat-chip :color="levelColorMap[item.level] || undefined">
                          {{ item.level }}
                        </mat-chip>

                        <mat-chip>
                          {{ sourceTitleMap[item.source] || item.source }}
                        </mat-chip>

                        <span class="text-mat-body-medium text-on-surface-variant">
                          {{ item.timestamp || '无时间戳' }}
                        </span>
                      </div>

                      <div
                        v-if="item.pluginId"
                        class="log-viewer__record-event text-mat-body-medium text-on-surface-variant"
                      >
                        {{ item.pluginId }}
                      </div>

                      <div class="log-viewer__record-message text-mat-body-large">
                        {{ item.message }}
                      </div>

                      <div
                        v-if="item.stack"
                        class="log-viewer__stack text-mat-body-medium"
                      >
                        {{ item.stack }}
                      </div>
                    </div>

                    <div class="log-viewer__record-actions">
                      <mat-btn
                        variant="filled-tonal"
                        @click="openDetail(item)"
                      >
                        查看详情
                      </mat-btn>
                    </div>
                  </div>
                </mat-card-content>
              </mat-card>
            </div>
          </template>
        </mat-virtual-scroll>
      </div>

      <mat-card
        v-if="!loading && !filteredRecords.length"
        class="rounded-3xl log-viewer__empty"
      >
        <mat-card-content class="text-on-surface-variant">
          当前条件下没有可显示的日志。
        </mat-card-content>
      </mat-card>

      <mat-card
        v-if="!loading && !filteredRecords.length"
        class="rounded-3xl log-viewer__empty"
        color="surface-container"
      >
        <mat-card-content class="text-on-surface-variant">
          当前条件下没有可显示的日志。
        </mat-card-content>
      </mat-card>
    </div>

    <mat-dialog
      v-model="detailDialog.visible"
      width="960"
      title="日志详情"
    >
      <div class="text-mat-body-medium text-on-surface-variant">
        {{ detailDialog.record?.timestamp || '无时间戳' }}
      </div>

      <div class="mt-2 text-mat-body-large log-viewer__detail-message">
        {{ detailDialog.record?.message || '' }}
      </div>

      <div class="log-viewer__tree">
        <json-tree
          :items="detailDialog.items"
          :opened="detailDialog.opened"
          :load-children="loadDetailChildren"
          @update:opened="detailDialog.opened = $event"
        />
      </div>

      <template #actions>
        <div class="grow" />

        <mat-btn
          variant="filled-tonal"
          :prefix="copyButtonIcon"
          @mouseenter="onCopyButtonEnter"
          @mouseleave="onCopyButtonLeave"
          @click="copyDetail"
        >
          {{ copyButtonText }}
        </mat-btn>

        <mat-btn
          color="primary"
          variant="text"
          @click="closeDetail"
        >
          关闭
        </mat-btn>
      </template>
    </mat-dialog>
  </mat-container>
</template>

<script setup>
import dayjs from 'dayjs';
import {
  computed,
  onActivated,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';

import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useClipboard, useIpc } from '@/hooks/electron';
import { STATUS_INFO, STATUS_WARNING } from '@/utils/statusColors';
import JsonTree from '@/components/JsonTree.vue';

const ipc = useIpc();
const clipboard = useClipboard();

const virtualScrollRef = ref(null);

const selectedDate = ref(dayjs().format('YYYY-MM-DD'));
const availableDates = ref([]);
const logResult = ref({
  files: [],
  records: [],
});
const loading = ref(false);
const errorMessage = ref('');
const syncingDate = ref(false);

const detailDialog = reactive({
  visible: false,
  items: [],
  opened: [],
  payload: null,
  record: null,
});
const copyState = reactive({
  copied: false,
  hovering: false,
  resetTimer: null,
  minVisibleUntil: 0,
});

const levelColorMap = {
  error: 'error',
  warn: STATUS_WARNING,
  info: STATUS_INFO,
  verbose: 'secondary',
  debug: 'primary',
  silly: undefined,
  log: undefined,
};

const sourceTitleMap = {
  common: '通用',
  error: '错误',
};

const levelOptions = [
  { title: 'error', value: 'error' },
  { title: 'warn', value: 'warn' },
  { title: 'info', value: 'info' },
  { title: 'verbose', value: 'verbose' },
  { title: 'debug', value: 'debug' },
  { title: 'silly', value: 'silly' },
  { title: 'log', value: 'log' },
];
const selectedLevels = ref(levelOptions.map((item) => item.value));

const hasLogDir = computed(() => logResult.value.files.length > 0 || availableDates.value.length > 0);

const dateOptions = computed(() => availableDates.value.map((date) => ({
  title: date,
  value: date,
})));

const filteredRecords = computed(() => {
  if (!selectedLevels.value.length) {
    return [];
  }
  if (selectedLevels.value.length === levelOptions.length) {
    return logResult.value.records;
  }
  return logResult.value.records.filter((record) => selectedLevels.value.includes(record.level));
});

const statusText = computed(() => {
  const existingFiles = logResult.value.files.filter((file) => file.exists);
  if (loading.value) {
    return '正在读取日志...';
  }
  if (!availableDates.value.length) {
    return '尚未发现任何日志文件。';
  }
  if (!existingFiles.length) {
    return `所选日期 ${selectedDate.value} 没有日志文件。`;
  }
  return `已加载 ${selectedDate.value} 的 ${existingFiles.length} 个文件，共 ${logResult.value.records.length} 条日志。`;
});

const copyButtonText = computed(() => (copyState.copied ? '已复制' : '复制日志'));
const copyButtonIcon = computed(() => (copyState.copied ? 'check' : 'content_copy'));

const getDetailEntries = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => ({
        childPath: index,
        label: `[${index}]`,
        value: item,
      }))
      .filter(({ value: item }) => typeof item !== 'undefined');
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  return Object.entries(value)
    .filter(([, childValue]) => typeof childValue !== 'undefined')
    .map(([key, childValue]) => ({
      childPath: key,
      label: key,
      value: childValue,
    }));
};

const formatDetailValue = (value) => {
  if (Array.isArray(value)) {
    return value.length ? `数组(${value.length})` : '[]';
  }

  if (value && typeof value === 'object') {
    const size = Object.values(value).filter((item) => typeof item !== 'undefined').length;
    return size ? `对象(${size})` : '{}';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'undefined') {
    return 'undefined';
  }

  return String(value);
};

const createDetailItem = (label, value, path) => {
  const entries = getDetailEntries(value);
  const hasChildren = Boolean(entries?.length);

  return {
    children: hasChildren ? [] : undefined,
    childrenLoaded: !hasChildren,
    label,
    title: label,
    value: path,
    valueSource: value,
    valueText: formatDetailValue(value),
  };
};

const loadDetailChildren = async (item) => {
  if (!item || item.childrenLoaded) {
    return;
  }

  const targetItem = item;
  const entries = getDetailEntries(targetItem.valueSource);
  targetItem.children = entries?.map(({ childPath, label, value }) => createDetailItem(label, value, `${targetItem.value}.${childPath}`)) || [];
  targetItem.childrenLoaded = true;
};

const buildDetailState = (record) => {
  const opened = [];
  const payload = record.raw;
  const items = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? Object.entries(payload)
      .filter(([, childValue]) => typeof childValue !== 'undefined')
      .map(([key, childValue]) => {
        const item = createDetailItem(key, childValue, key);

        if (key !== 'data' && item.children) {
          opened.push(key);
          item.children = getDetailEntries(childValue)?.map(({ childPath, label, value }) => createDetailItem(label, value, `${key}.${childPath}`)) || [];
          item.childrenLoaded = true;
        }

        return item;
      })
    : [createDetailItem('value', payload, 'value')];

  return {
    items,
    opened,
    payload,
  };
};

const ensureSelectedDate = (dates) => {
  if (!dates.length) {
    return;
  }
  const [latestDate] = dates;
  if (!dates.includes(selectedDate.value)) {
    selectedDate.value = latestDate;
  }
};

const loadAvailableDates = async () => {
  const dates = await ipc.invoke(ipcType.GET_LOG_DATES);
  syncingDate.value = true;
  availableDates.value = dates;
  ensureSelectedDate(dates);
  syncingDate.value = false;
};

const loadRecords = async () => {
  if (!selectedDate.value) {
    logResult.value = {
      files: [],
      records: [],
    };
    return;
  }
  logResult.value = await ipc.invoke(ipcType.GET_LOG_RECORDS, selectedDate.value);
};

const refreshLogs = async () => {
  loading.value = true;
  errorMessage.value = '';
  try {
    await loadAvailableDates();
    await loadRecords();
  } catch (error) {
    errorMessage.value = error.message || '日志读取失败';
    logResult.value = {
      files: [],
      records: [],
    };
  } finally {
    loading.value = false;
  }
};

const openLogDir = async () => {
  const appDataPath = await ipc.invoke(ipcType.GET_PATH, 'userData');
  ipc.send(ipcType.OPEN_DIR, {
    dirPath: `${appDataPath}/logs`,
  });
};

const openDetail = (record) => {
  const detailState = buildDetailState(record);

  detailDialog.record = record;
  detailDialog.items = detailState.items;
  detailDialog.opened = detailState.opened;
  detailDialog.payload = detailState.payload;
  detailDialog.visible = true;
};

const clearCopyTimer = () => {
  if (copyState.resetTimer) {
    clearTimeout(copyState.resetTimer);
    copyState.resetTimer = null;
  }
};

const resetCopyState = () => {
  clearCopyTimer();
  copyState.copied = false;
  copyState.minVisibleUntil = 0;
};

const closeDetail = () => {
  detailDialog.visible = false;
  detailDialog.record = null;
  detailDialog.items = [];
  detailDialog.opened = [];
  detailDialog.payload = null;
  resetCopyState();
};

const scheduleCopyReset = () => {
  clearCopyTimer();
  if (copyState.hovering) {
    return;
  }

  const delay = Math.max(copyState.minVisibleUntil - Date.now(), 0);
  copyState.resetTimer = setTimeout(() => {
    if (!copyState.hovering) {
      resetCopyState();
    }
  }, delay);
};

const copyDetail = async () => {
  await clipboard.writeText(JSON.stringify(detailDialog.payload, null, 2));
  copyState.copied = true;
  copyState.minVisibleUntil = Date.now() + 1200;
  scheduleCopyReset();
};

const onCopyButtonEnter = () => {
  copyState.hovering = true;
  clearCopyTimer();
};

const onCopyButtonLeave = () => {
  copyState.hovering = false;
  if (!copyState.copied) {
    return;
  }
  scheduleCopyReset();
};

watch(selectedDate, async (value, oldValue) => {
  if (!value || value === oldValue || syncingDate.value) {
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  try {
    await loadRecords();
  } catch (error) {
    errorMessage.value = error.message || '日志读取失败';
    logResult.value = {
      files: [],
      records: [],
    };
  } finally {
    loading.value = false;
  }
});

onMounted(async () => {
  await refreshLogs();
});

// keep-alive 恢复后滚动位置被重置，虚拟区间需按视口顶部重新计算
onActivated(() => {
  virtualScrollRef.value?.refresh();
});
</script>

<style scoped>
/* 卡片背景走卡片专用变量；color prop 注入的 --mat-accent-color 会被后代 select 继承，
   聚焦时 2px 外框会变成 surface-container 近白色而在浅色背景上不可见 */
.log-viewer :deep(.mat-card) {
  --mat-card-container-color: var(--mat-sys-color-surface-container);
}

.log-viewer__container {
  max-width: 60rem;
  margin: 0 auto;
}

/* 日期与级别筛选同行：日期定宽，级别占满剩余空间并推动操作按钮靠右 */
.log-viewer__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: .75rem;
}

.log-viewer__date-select {
  width: 11rem;
  flex-shrink: 0;
}

.log-viewer__level-select {
  flex: 1 1 12rem;
  min-width: 0;
}

.log-viewer__toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
  flex-shrink: 0;
}

.log-viewer__status {
  margin-top: .75rem;
}

/* 虚拟滚动按 borderBox 测量项高，卡片间距放进包裹层 padding 而不是容器 gap */
.log-viewer__records {
  margin-top: 1rem;
}

.log-viewer__record-slot {
  padding-block-end: .75rem;
}

.log-viewer__record {
  display: flex;
  flex-direction: column;
  gap: .75rem;
}

.log-viewer__record-main {
  min-width: 0;
  flex: 1;
}

.log-viewer__record-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: .5rem;
}

.log-viewer__record-event {
  margin-top: .75rem;
}

.log-viewer__record-message {
  margin-top: .25rem;
  word-break: break-all;
}

.log-viewer__stack {
  margin-top: .75rem;
  padding: .75rem;
  border-radius: .75rem;
  background: color-mix(in srgb, var(--mat-sys-color-on-surface) 5%, transparent);
  white-space: pre-wrap;
  word-break: break-all;
}

.log-viewer__record-actions {
  flex-shrink: 0;
}

.log-viewer__empty {
  margin-top: 1rem;
}

.log-viewer__tree {
  margin-top: 1rem;
  padding: .5rem;
  border-radius: .75rem;
  background: color-mix(in srgb, var(--mat-sys-color-on-surface) 3%, transparent);
}

.log-viewer__detail-message {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (width >= 80rem) {
  .log-viewer__record {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
  }
}
</style>
