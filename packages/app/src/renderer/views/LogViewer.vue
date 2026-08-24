<template>
  <v-container class="log-viewer">
    <div class="log-viewer__container">
      <div class="log-viewer__title">
        日志
      </div>

      <v-card
        class="rounded-2xl mt-4"
        flat
        rounded
        color="surface-container"
      >
        <v-card-text>
          <div class="log-viewer__toolbar">
            <v-select
              v-model="selectedDate"
              class="log-viewer__toolbar-field"
              data-test="log-date-select"
              :items="dateOptions"
              item-title="title"
              item-value="value"
              label="日期"
              hide-details
              :disabled="loading || !dateOptions.length"
            >
              <template #item="{ props: itemProps, item }">
                <v-list-item
                  v-bind="itemProps"
                  :data-test="`log-date-option-${item.value}`"
                  :data-test-date="item.value"
                />
              </template>
            </v-select>

            <v-select
              v-model="selectedLevels"
              class="log-viewer__toolbar-field log-viewer__toolbar-field--level"
              data-test="log-level-select"
              :items="levelOptions"
              item-title="title"
              item-value="value"
              label="级别"
              multiple
              chips
              hide-details
              :disabled="loading"
            />

            <div class="log-viewer__toolbar-actions">
              <v-btn
                color="primary"
                :loading="loading"
                @click="refreshLogs"
              >
                刷新
              </v-btn>

              <v-btn
                variant="tonal"
                :disabled="!hasLogDir"
                @click="openLogDir"
              >
                打开日志目录
              </v-btn>
            </div>
          </div>

          <div class="log-viewer__status text-medium-emphasis">
            {{ statusText }}
          </div>

          <v-alert
            v-if="errorMessage"
            class="mt-4"
            type="error"
            variant="tonal"
          >
            {{ errorMessage }}
          </v-alert>
        </v-card-text>
      </v-card>

      <div
        class="log-viewer__records"
        data-test="log-records-container"
      >
        <v-card
          v-for="record in filteredRecords"
          data-test="log-record-card"
          :key="record.id"
          class="rounded-2xl"
          flat
          rounded
          color="surface-container"
        >
          <v-card-text>
            <div class="log-viewer__record">
              <div class="log-viewer__record-main">
                <div class="log-viewer__record-meta">
                  <v-chip
                    size="small"
                    :color="levelColorMap[record.level] || 'default'"
                  >
                    {{ record.level }}
                  </v-chip>

                  <v-chip
                    size="small"
                    variant="outlined"
                  >
                    {{ sourceTitleMap[record.source] || record.source }}
                  </v-chip>

                  <span class="text-sm text-medium-emphasis">
                    {{ record.timestamp || '无时间戳' }}
                  </span>
                </div>

                <div
                  v-if="record.pluginId"
                  class="log-viewer__record-event text-sm text-medium-emphasis"
                >
                  {{ record.pluginId }}
                </div>

                <div class="log-viewer__record-message">
                  {{ record.message }}
                </div>

                <div
                  v-if="record.stack"
                  class="log-viewer__stack"
                >
                  {{ record.stack }}
                </div>
              </div>

              <div class="log-viewer__record-actions">
                <v-btn
                  variant="tonal"
                  @click="openDetail(record)"
                >
                  查看详情
                </v-btn>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </div>

      <v-card
        v-if="!loading && !filteredRecords.length"
        class="rounded-2xl log-viewer__empty"
        flat
        rounded
        color="surface-container"
      >
        <v-card-text class="text-medium-emphasis">
          当前条件下没有可显示的日志。
        </v-card-text>
      </v-card>
    </div>

    <v-dialog
      v-model="detailDialog.visible"
      max-width="960"
      scrollable
    >
      <v-card color="surface-container-high">
        <v-card-title>
          日志详情
        </v-card-title>

        <v-card-text>
          <div class="text-sm text-medium-emphasis">
            {{ detailDialog.record?.timestamp || '无时间戳' }}
          </div>

          <div class="mt-2 text-base log-viewer__detail-message">
            {{ detailDialog.record?.message || '' }}
          </div>

          <v-treeview
            v-model:opened="detailDialog.opened"
            :items="detailDialog.items"
            :load-children="loadDetailChildren"
            class="log-viewer__tree"
            density="compact"
            :indent="12"
            item-title="title"
            item-value="value"
            :prepend-gap="4"
            open-on-click
            slim
          >
            <template #title="{ item }">
              <div class="log-viewer__tree-node">
                <span class="log-viewer__tree-label">{{ item.label }}</span>
                <span class="log-viewer__tree-colon text-medium-emphasis">:</span>
                <span
                  v-if="item.valueText"
                  class="log-viewer__tree-value text-medium-emphasis"
                >
                  {{ item.valueText }}
                </span>
              </div>
            </template>
          </v-treeview>
        </v-card-text>

        <v-card-actions>
          <v-spacer />

          <v-btn
            variant="tonal"
            :prepend-icon="copyButtonIcon"
            @mouseenter="onCopyButtonEnter"
            @mouseleave="onCopyButtonLeave"
            @click="copyDetail"
          >
            {{ copyButtonText }}
          </v-btn>

          <v-btn
            color="primary"
            @click="closeDetail"
          >
            关闭
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import dayjs from 'dayjs';
import {
  computed,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';

import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useClipboard, useIpc } from '@/hooks/electron';

const ipc = useIpc();
const clipboard = useClipboard();

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
  warn: 'warning',
  info: 'info',
  verbose: 'secondary',
  debug: 'primary',
  silly: 'default',
  log: 'default',
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
</script>

<style scoped>
.log-viewer__container {
  max-width: 60rem;
  margin: 0 auto;
}

.log-viewer__title {
  text-align: center;
  font-size: 3rem;
  line-height: 1.1;
}

.log-viewer__toolbar {
  display: flex;
  flex-direction: column;
  gap: .75rem;
}

.log-viewer__toolbar-field {
  min-width: 0;
}

.log-viewer__toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
}

.log-viewer__status {
  margin-top: .75rem;
  font-size: .875rem;
}

.log-viewer__records {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: .75rem;
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
  font-size: 1rem;
}

.log-viewer__stack {
  margin-top: .75rem;
  padding: .75rem;
  border-radius: .75rem;
  background: rgb(0 0 0 / 5%);
  white-space: pre-wrap;
  word-break: break-all;
  font-size: .875rem;
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
  background: rgb(0 0 0 / 3%);
}

.log-viewer__detail-message {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.log-viewer__tree-node {
  display: grid;
  grid-template-columns: max-content max-content minmax(0, 1fr);
  align-items: start;
  column-gap: .375rem;
  width: 100%;
  min-height: 1.5rem;
}

.log-viewer__tree-label {
  font-weight: 500;
}

.log-viewer__tree-colon {
  margin-inline: -.125rem;
}

.log-viewer__tree-value {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (width >= 80rem) {
  .log-viewer__toolbar {
    flex-direction: row;
    align-items: center;
  }

  .log-viewer__toolbar-field {
    max-width: 14rem;
  }

  .log-viewer__toolbar-field--level {
    flex: 1 1 auto;
    max-width: none;
  }

  .log-viewer__record {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
  }
}
</style>
