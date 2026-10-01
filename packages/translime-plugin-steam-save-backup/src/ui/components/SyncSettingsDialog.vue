<template>
  <!-- mat-dialog 内容被 Teleport 到宿主 @scope 隔离范围之外，样式必须内联 -->
  <mat-dialog
    v-model="visible"
    width="560px"
    close-on-back
    title="远程同步"
  >
    <div style="display: flex; flex-direction: column; gap: 16px; padding-bottom: 4px">
      <mat-switch v-model="form.enabled">
        启用远程同步（备份后与插件启动时自动对账）
      </mat-switch>

      <mat-text-field
        v-model="form.target"
        style="width: 100%"
        label="远程目标"
        placeholder="例如：mydrive:SteamBackups 或 D:\Backups\Steam"
        variant="outlined"
        color="primary"
        :max-length="300"
      />
      <div style="font-size: .75rem; color: var(--mat-sys-color-on-surface-variant); margin-top: -10px">
        支持 rclone 远程（remote:路径）与本地/网络路径（NAS、挂载盘）。
        云盘等 rclone 远程请先在系统 rclone 中完成配置与授权。
      </div>

      <mat-text-field
        v-model="form.rclonePath"
        style="width: 100%"
        label="rclone 路径（可选）"
        placeholder="留空则使用系统 PATH 中的 rclone"
        variant="outlined"
        color="primary"
        readonly
        @click="pickRclone"
      >
        <template #trailing>
          <mat-btn
            icon="folder_open"
            variant="standard"
            size="small"
            aria-label="选择 rclone 可执行文件"
            @click.stop="pickRclone"
          />
        </template>
      </mat-text-field>

      <div style="display: flex; align-items: center; gap: 12px">
        <mat-btn
          variant="text"
          prefix="search"
          :loading="probing"
          @click="probe"
        >
          检测 rclone
        </mat-btn>
        <span
          v-if="probeResult"
          :style="{ fontSize: '.875rem', color: probeResult.ok ? 'var(--mat-sys-color-primary)' : 'var(--mat-sys-color-error)' }"
        >
          {{ probeResult.ok ? `rclone v${probeResult.version} 可用` : `不可用：${probeResult.error}` }}
        </span>
      </div>

      <mat-divider style="margin-block: 4px" />

      <div style="display: flex; flex-direction: column; gap: 6px; font-size: .875rem; color: var(--mat-sys-color-on-surface-variant)">
        <span v-if="phase === 'running'">正在同步…</span>
        <span v-else-if="lastRunAt">上次同步：{{ formatTime(lastRunAt) }}</span>
        <span v-else>尚未同步过</span>
        <span v-if="reportSummary">{{ reportSummary }}</span>
        <span
          v-if="lastError"
          role="alert"
          style="color: var(--mat-sys-color-error); word-break: break-all"
        >
          {{ lastError }}
        </span>
      </div>

      <div
        v-if="formError"
        role="alert"
        style="font-size: .875rem; color: var(--mat-sys-color-error)"
      >
        {{ formError }}
      </div>

      <div style="font-size: .75rem; color: var(--mat-sys-color-on-surface-variant)">
        远端是可靠源：本地删除的备份会在下次同步时从远端重新下载，
        彻底删除请直接清理远端目录（v1 暂不做自动清理与删除传播）。
      </div>
    </div>

    <template #actions>
      <mat-spacer />

      <mat-btn
        v-if="phase === 'running'"
        variant="text"
        color="error"
        @click="cancel"
      >
        取消同步
      </mat-btn>
      <mat-btn
        v-else
        variant="text"
        prefix="cloud_sync"
        :disabled="!form.enabled || !form.target"
        @click="syncNow"
      >
        立即同步
      </mat-btn>

      <mat-btn
        variant="text"
        @click="visible = false"
      >
        关闭
      </mat-btn>

      <mat-btn
        variant="filled"
        color="primary"
        prefix="save"
        :disabled="form.enabled && !form.target"
        :loading="saving"
        @click="save"
      >
        保存
      </mat-btn>
    </template>
  </mat-dialog>
</template>

<script setup>
import {
  computed,
  reactive,
  ref,
  watch,
} from 'vue';
import { useDialog } from 'translime-sdk';
import {
  cancelSync,
  checkRclone,
  refreshSyncStatus,
  setSyncConfig,
  syncStatus,
  triggerSyncNow,
} from '../composables/useSyncStatus';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue']);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const form = reactive({ enabled: false, target: '', rclonePath: '' });
const formError = ref('');
const saving = ref(false);
const probing = ref(false);
const probeResult = ref(null);

const phase = computed(() => syncStatus.value?.phase || 'idle');
const lastRunAt = computed(() => syncStatus.value?.lastRunAt || null);
const lastError = computed(() => syncStatus.value?.lastError || null);
const reportSummary = computed(() => {
  const totals = syncStatus.value?.lastReport?.totals;
  if (!totals) {
    return '';
  }
  return `上次对账：上传 ${totals.uploads} · 下载 ${totals.downloads} · 冲突保留 ${totals.renames}`;
});

const formatTime = (isoString) => new Date(isoString).toLocaleString('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

watch(visible, (open) => {
  if (open) {
    formError.value = '';
    probeResult.value = null;
    const config = syncStatus.value?.config;
    form.enabled = Boolean(config?.enabled);
    form.target = config?.target || '';
    form.rclonePath = config?.rclonePath || '';
    refreshSyncStatus();
  }
});

const pickRclone = async () => {
  const dialog = useDialog();
  if (!dialog) {
    return;
  }
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'dontAddToRecent'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    [form.rclonePath] = result.filePaths;
    formError.value = '';
  }
};

const probe = async () => {
  probing.value = true;
  formError.value = '';
  try {
    const res = await checkRclone(form.rclonePath);
    probeResult.value = res?.rclone || { ok: false, error: res?.message || '检测失败' };
  } catch (err) {
    probeResult.value = { ok: false, error: err.message };
  } finally {
    probing.value = false;
  }
};

const syncNow = async () => {
  formError.value = '';
  const res = await triggerSyncNow();
  if (!res?.success) {
    formError.value = res?.message || '触发同步失败';
  }
};

const cancel = async () => {
  await cancelSync();
};

const save = async () => {
  if (form.enabled && !form.target.trim()) {
    formError.value = '启用同步前需要填写远程目标';
    return;
  }
  saving.value = true;
  formError.value = '';
  try {
    const res = await setSyncConfig({ ...form });
    if (!res?.success) {
      formError.value = res?.message || '保存失败';
    }
  } catch (err) {
    formError.value = err.message || '保存失败';
  } finally {
    saving.value = false;
  }
};
</script>
