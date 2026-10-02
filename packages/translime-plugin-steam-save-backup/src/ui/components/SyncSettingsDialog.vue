<template>
  <!-- mat-dialog 内容被 Teleport 到宿主 @scope 隔离范围之外，样式必须内联 -->
  <mat-dialog
    v-model="visible"
    width="560px"
    close-on-back
    title="远程同步"
  >
    <!-- 远程管理视图：选择后端类型 → 填凭据 / OAuth 授权 → 创建远程 -->
    <template v-if="view === 'remote'">
      <div style="display: flex; flex-direction: column; gap: 16px; padding-bottom: 4px">
        <mat-select
          v-model="selectedType"
          label="存储后端"
          :items="backendItems"
          variant="outlined"
          color="primary"
          :disabled="isEditing"
          style="width: 100%"
        />

        <div
          v-if="isEditing"
          style="font-size: .75rem; color: var(--mat-sys-color-on-surface-variant); margin-top: -8px"
        >
          正在修改远程「{{ editingName }}」的凭据；更换后端类型请改用「新建 / 授权远程」。
        </div>

        <div
          v-if="currentBackend?.hint"
          style="font-size: .75rem; color: var(--mat-sys-color-on-surface-variant); margin-top: -8px"
        >
          {{ currentBackend.hint }}
        </div>

        <template v-for="field in currentFields" :key="field.key">
          <mat-select
            v-if="field.type === 'select'"
            v-model="fieldValues[field.key]"
            :label="field.label"
            :items="field.choices"
            variant="outlined"
            color="primary"
            style="width: 100%"
          />
          <mat-text-field
            v-else
            v-model="fieldValues[field.key]"
            :type="field.type === 'password' ? 'password' : 'text'"
            :label="field.label"
            :placeholder="isEditing && field.type === 'password' ? '留空保持原密码不变' : field.placeholder"
            variant="outlined"
            color="primary"
            style="width: 100%"
          />
        </template>

        <div
          v-if="authorizeWaiting"
          style="display: flex; flex-direction: column; gap: 8px; font-size: .875rem"
        >
          <span style="color: var(--mat-sys-color-primary)">等待浏览器授权完成…</span>
          <span
            v-if="authorizeUrl"
            style="color: var(--mat-sys-color-on-surface-variant); word-break: break-all"
          >
            浏览器未打开？
            <a
              :href="authorizeUrl"
              style="color: var(--mat-sys-color-primary)"
              @click.prevent="openAuthorizeUrl"
            >点此打开授权页面</a>
          </span>
          <mat-btn
            variant="text"
            color="error"
            @click="cancelAuthorize"
          >
            取消授权
          </mat-btn>
        </div>

        <div
          v-if="formError"
          role="alert"
          style="font-size: .875rem; color: var(--mat-sys-color-error); word-break: break-all"
        >
          {{ formError }}
        </div>

        <div style="font-size: .75rem; color: var(--mat-sys-color-on-surface-variant)">
          远程以「translime-后端名」写入系统 rclone 配置，重复创建会覆盖旧凭据；
          令牌与密码只保存在本机 rclone 配置文件中。
        </div>

        <div
          v-if="testResult"
          role="status"
          :style="{ fontSize: '.875rem', wordBreak: 'break-all', color: testResult.ok ? 'var(--mat-sys-color-primary)' : 'var(--mat-sys-color-error)' }"
        >
          {{ testResultText }}
        </div>
      </div>
    </template>

    <!-- 主视图：开关 / 目标 / 检测 / 状态 -->
    <template v-else>
      <div style="display: flex; flex-direction: column; gap: 16px; padding-bottom: 4px">
        <mat-switch v-model="form.enabled">
          启用远程同步（备份后与插件启动时自动对账）
        </mat-switch>

        <div style="display: flex; align-items: center; gap: 8px">
          <mat-select
            v-model="selectedRemote"
            label="远程位置"
            :items="remoteItems"
            variant="outlined"
            color="primary"
            supporting-text="选择已有远程自动填入目标；本地或 NAS 路径选第一项直接填写"
            style="flex: 1; min-width: 0"
          />
          <mat-btn
            icon="edit"
            variant="standard"
            size="small"
            aria-label="修改远程"
            :disabled="!canEditSelectedRemote"
            @click="openEditRemote"
          />
          <mat-btn
            icon="delete"
            variant="standard"
            size="small"
            color="error"
            aria-label="删除远程"
            :disabled="!selectedRemoteInfo"
            @click="askDeleteRemote"
          />
        </div>

        <mat-text-field
          v-model="form.target"
          style="width: 100%"
          label="远程目标"
          placeholder="例如：mydrive:SteamBackups 或 D:\Backups\Steam"
          variant="outlined"
          color="primary"
          :max-length="300"
        />

        <div style="display: flex; align-items: center; gap: 12px; margin-top: -8px">
          <mat-btn
            variant="text"
            prefix="add"
            @click="openRemoteSetup"
          >
            新建 / 授权远程
          </mat-btn>
          <span style="font-size: .75rem; color: var(--mat-sys-color-on-surface-variant)">
            在目标后追加子目录即可，例如 mydrive:SteamBackups
          </span>
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

        <div style="font-size: .75rem; color: var(--mat-sys-color-on-surface-variant); margin-top: -8px">
          未安装 rclone？
          <a
            href="https://rclone.org/downloads/"
            style="color: var(--mat-sys-color-primary)"
            @click.prevent="openDownloads"
          >前往 rclone.org/downloads 下载</a>
        </div>

        <mat-divider style="margin-block: 4px" />

        <!-- 同步冲突：同名备份在两端内容分叉，需用户选择处理方式 -->
        <div
          v-if="conflicts.length > 0"
          style="display: flex; flex-direction: column; gap: 12px"
        >
          <div style="font-size: .9375rem; font-weight: 500; color: var(--mat-sys-color-error)">
            检测到 {{ conflicts.length }} 个同步冲突（同名备份在本地与远程内容不同，已暂停自动同步）
          </div>

          <div
            v-for="conflict in conflicts"
            :key="`${conflict.gameId}:${conflict.dir}`"
            style="display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--mat-sys-color-outline-variant); border-radius: 12px"
          >
            <div style="font-weight: 500; word-break: break-all">
              {{ conflict.gameName || conflict.gameId }}
            </div>
            <div style="font-size: .75rem; color: var(--mat-sys-color-on-surface-variant); word-break: break-all">
              备份目录：{{ conflict.dir }}
            </div>
            <div style="display: flex; flex-direction: column; gap: 2px; font-size: .75rem; color: var(--mat-sys-color-on-surface-variant)">
              <span>本地版本：{{ conflictMetaText(conflict.local) }}</span>
              <span>远程版本：{{ conflictMetaText(conflict.remote) }}</span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px">
              <mat-btn
                variant="text"
                prefix="cloud_download"
                :disabled="resolvingKey !== ''"
                :loading="resolvingKey === `${conflict.gameId}:${conflict.dir}:overwrite-local`"
                @click="resolve(conflict, 'overwrite-local')"
              >
                覆盖本地
              </mat-btn>
              <mat-btn
                variant="text"
                prefix="cloud_upload"
                :disabled="resolvingKey !== ''"
                :loading="resolvingKey === `${conflict.gameId}:${conflict.dir}:overwrite-remote`"
                @click="resolve(conflict, 'overwrite-remote')"
              >
                覆盖远程
              </mat-btn>
              <mat-btn
                variant="text"
                prefix="library_add"
                :disabled="resolvingKey !== ''"
                :loading="resolvingKey === `${conflict.gameId}:${conflict.dir}:keep-both`"
                @click="resolve(conflict, 'keep-both')"
              >
                保留两份
              </mat-btn>
            </div>
          </div>
        </div>

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
      </div>
    </template>

    <template #actions>
      <mat-btn
        v-if="view === 'remote'"
        variant="text"
        prefix="cloud_done"
        :disabled="!selectedTypeRemoteExists || authorizeWaiting"
        :loading="testing"
        @click="testRemoteConnection"
      >
        测试连接
      </mat-btn>

      <mat-spacer />

      <template v-if="view === 'remote'">
        <mat-btn
          variant="text"
          :disabled="authorizeWaiting"
          @click="backToMain"
        >
          返回
        </mat-btn>

        <mat-btn
          variant="filled"
          color="primary"
          :prefix="!isEditing && currentBackend?.auth === 'oauth' ? 'cloud_sync' : 'save'"
          :disabled="!selectedType"
          :loading="creating"
          @click="createRemoteFromForm"
        >
          {{ remoteSubmitText }}
        </mat-btn>
      </template>

      <template v-else>
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
    </template>
  </mat-dialog>

  <ConfirmDialog
    v-model="deleteConfirm.show"
    :dialog="deleteConfirm"
    @confirm="removeRemote"
  />
</template>

<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import {
  openLink,
  useDialog,
  useIpc,
} from 'translime-sdk';
import ConfirmDialog from './ConfirmDialog.vue';
import {
  cancelSync,
  checkRclone,
  refreshSyncStatus,
  resolveSyncConflict,
  setSyncConfig,
  syncStatus,
  triggerSyncNow,
} from '../composables/useSyncStatus';

const PLUGIN_ID = 'translime-plugin-steam-save-backup';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue']);

const ipc = useIpc();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const form = reactive({ enabled: false, target: '', rclonePath: '' });
const formError = ref('');
const saving = ref(false);
const probing = ref(false);
const probeResult = ref(null);

// 远程管理视图状态
const view = ref('main');
const backends = ref([]);
const remotes = ref([]);
const loadingRemotes = ref(false);
const selectedRemote = ref('');
const selectedType = ref(null);
const fieldValues = reactive({});
const creating = ref(false);
const authorizeWaiting = ref(false);
const authorizeUrl = ref('');
const resolvingKey = ref('');
// 远程编辑 / 删除 / 连接测试反馈
const editingName = ref('');
const deleteConfirm = ref({ show: false });
const testing = ref(false);
const testResult = ref(null);

const phase = computed(() => syncStatus.value?.phase || 'idle');
const conflicts = computed(() => syncStatus.value?.conflicts || []);
const lastRunAt = computed(() => syncStatus.value?.lastRunAt || null);
const lastError = computed(() => syncStatus.value?.lastError || null);
const reportSummary = computed(() => {
  const totals = syncStatus.value?.lastReport?.totals;
  if (!totals) {
    return '';
  }
  return `上次对账：上传 ${totals.uploads} · 下载 ${totals.downloads} · 冲突 ${totals.conflicts ?? 0}`;
});

const currentBackend = computed(() => backends.value.find((item) => item.id === selectedType.value) || null);
const currentFields = computed(() => currentBackend.value?.fields || []);
const isEditing = computed(() => Boolean(editingName.value));
const backendItems = computed(() => backends.value.map((item) => ({
  title: item.label,
  value: item.id,
  subtitle: item.hint,
})));
const remoteItems = computed(() => [
  { title: '本地 / 网络路径（直接填写）', value: '' },
  ...remotes.value.map((remote) => ({ title: `${remote.name}:`, value: `${remote.name}:` })),
]);
const selectedRemoteInfo = computed(() => remotes.value.find((remote) => `${remote.name}:` === selectedRemote.value) || null);
// OAuth 远程没有可编辑的表单字段，修改凭据等于重新授权，引导走「新建 / 授权远程」
const canEditSelectedRemote = computed(() => {
  const info = selectedRemoteInfo.value;
  if (!info) {
    return false;
  }
  const backend = backends.value.find((item) => item.id === info.type);
  return Boolean(backend && backend.auth !== 'oauth');
});
const remoteSubmitText = computed(() => {
  if (isEditing.value) {
    return '保存修改';
  }
  return currentBackend.value?.auth === 'oauth' ? '授权并创建' : '创建远程';
});
// 连接测试针对已保存的远程（命名规则为 translime-<类型>），类型对应的远程不存在时不可用
const selectedTypeRemoteExists = computed(() => Boolean(selectedType.value)
  && remotes.value.some((remote) => remote.name === `translime-${selectedType.value}`));
const testResultText = computed(() => {
  if (!testResult.value) {
    return '';
  }
  if (testResult.value.ok) {
    return testResult.value.note ? `连接成功（${testResult.value.note}）` : '连接成功';
  }
  return `连接失败：${testResult.value.error}`;
});

const formatTime = (isoString) => new Date(isoString).toLocaleString('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const resetFormError = () => {
  formError.value = '';
};

// 每个远程位置记住各自的目标（含手填子路径），切换下拉互不覆盖；
// 保存的同步配置仍是唯一事实源，记忆只用于对话框内的切换连续性
const targetByRemote = reactive({});
let lastRemoteKey = null;
// 本次对话框打开期间是否保存过配置：关闭时据此触发一次对账
let savedDuringOpen = false;
watch(selectedRemote, (value) => {
  if (lastRemoteKey !== null) {
    targetByRemote[lastRemoteKey] = form.target;
  }
  lastRemoteKey = value;
  form.target = targetByRemote[value] ?? (value || '');
});

watch(visible, async (open) => {
  if (open) {
    savedDuringOpen = false;
    resetFormError();
    probeResult.value = null;
    testResult.value = null;
    view.value = 'main';
    // webview 实例会被缓存复用：打开时先取最新状态再填表单，
    // 避免旧状态里的空配置在保存时覆盖刚写入的设置
    await refreshSyncStatus();
    const config = syncStatus.value?.config;
    form.enabled = Boolean(config?.enabled);
    form.rclonePath = config?.rclonePath || '';
    // 后端类型表驱动「修改」按钮的可用性（OAuth 远程不可编辑）；列表加载后再按已保存目标选中远程，
    // 目标含子路径（如 translime-smb:share）时也挂到所属远程名下，切换下拉不会丢
    await Promise.all([loadBackends(), loadRemotes()]);
    form.target = config?.target || '';
    lastRemoteKey = null;
    const matchedRemote = remotes.value.find((remote) => form.target.startsWith(`${remote.name}:`));
    targetByRemote[matchedRemote ? `${matchedRemote.name}:` : ''] = form.target;
    selectedRemote.value = matchedRemote ? `${matchedRemote.name}:` : '';
  } else if (savedDuringOpen) {
    // 完全保存后（关闭对话框）才触发对账：保存动作只落盘，不打断后续编辑
    savedDuringOpen = false;
    triggerSyncNow().catch(() => {});
  }
});

watch(selectedType, () => {
  resetFormError();
  testResult.value = null;
  Object.keys(fieldValues).forEach((key) => {
    delete fieldValues[key];
  });
  (currentBackend.value?.fields || []).forEach((field) => {
    fieldValues[field.key] = field.default != null ? String(field.default) : '';
  });
});

// 主进程在 rclone authorize 启动后推送本地回调授权链接
const onAuthorizeUrl = (payload) => {
  if (payload?.url) {
    authorizeUrl.value = payload.url;
  }
};

onMounted(() => {
  ipc?.on('sync-authorize-url', onAuthorizeUrl);
});

onBeforeUnmount(() => {
  ipc?.detach('sync-authorize-url');
});

const loadRemotes = async () => {
  loadingRemotes.value = true;
  try {
    const res = await ipc.invoke(`sync-list-remotes@${PLUGIN_ID}`);
    if (res?.success) {
      remotes.value = res.remotes || [];
    } else if (res?.message) {
      formError.value = res.message;
    }
  } catch (err) {
    formError.value = err.message || '读取远程列表失败';
  } finally {
    loadingRemotes.value = false;
  }
};

const loadBackends = async () => {
  if (backends.value.length > 0) {
    return;
  }
  try {
    const res = await ipc.invoke(`sync-backend-types@${PLUGIN_ID}`);
    if (res?.success) {
      backends.value = res.backends || [];
    }
  } catch {
    // 后端类型表加载失败时保持为空，UI 显示无选项
  }
};

const openRemoteSetup = async () => {
  resetFormError();
  testResult.value = null;
  editingName.value = '';
  view.value = 'remote';
  loadBackends();
  loadRemotes();
};

const backToMain = () => {
  if (authorizeWaiting.value) {
    return;
  }
  resetFormError();
  testResult.value = null;
  editingName.value = '';
  view.value = 'main';
};

/**
 * 编辑远程：读取远程配置回填非密码字段（密码留空表示保持不变），保存时只更新提交的字段。
 * 编辑模式下锁定后端类型——换类型等于新建另一名字的远程。
 */
const openEditRemote = async () => {
  const info = selectedRemoteInfo.value;
  if (!info || creating.value) {
    return;
  }
  resetFormError();
  testResult.value = null;
  view.value = 'remote';
  await loadBackends();
  try {
    const res = await ipc.invoke(`sync-get-remote@${PLUGIN_ID}`, { name: info.name });
    if (!res?.success) {
      // 留在远程视图展示错误，避免界面闪现后立即回退
      formError.value = res?.message || '读取远程配置失败';
      return;
    }
    editingName.value = info.name;
    selectedType.value = res.remote.type;
    // selectedType 的 watch 会用默认值重置表单，等它执行完再回填远程读到的配置
    await nextTick();
    Object.keys(fieldValues).forEach((key) => {
      delete fieldValues[key];
    });
    (currentBackend.value?.fields || []).forEach((field) => {
      fieldValues[field.key] = field.default != null ? String(field.default) : '';
    });
    Object.entries(res.remote.values || {}).forEach(([key, value]) => {
      fieldValues[key] = value;
    });
  } catch (err) {
    formError.value = err.message || '读取远程配置失败';
  }
};

const askDeleteRemote = () => {
  const info = selectedRemoteInfo.value;
  if (!info) {
    return;
  }
  deleteConfirm.value = {
    show: true,
    title: '删除远程',
    icon: 'delete',
    color: 'error',
    message: `确定要删除远程「${info.name}」吗？`,
    detail: '只删除本机 rclone 配置中的连接凭据，不会删除已同步到远端的存档数据。',
    confirmText: '确认删除',
  };
};

const removeRemote = async () => {
  const info = selectedRemoteInfo.value;
  if (!info) {
    return;
  }
  deleteConfirm.value = { ...deleteConfirm.value, loading: true };
  try {
    const res = await ipc.invoke(`sync-delete-remote@${PLUGIN_ID}`, { name: info.name });
    deleteConfirm.value = { ...deleteConfirm.value, show: false, loading: false };
    if (res?.success) {
      if (res.targetCleared) {
        form.target = '';
        selectedRemote.value = '';
      }
      delete targetByRemote[`${info.name}:`];
      formError.value = '';
      await Promise.all([refreshSyncStatus(), loadRemotes()]);
    } else {
      formError.value = res?.message || '删除远程失败';
    }
  } catch (err) {
    deleteConfirm.value = { ...deleteConfirm.value, show: false, loading: false };
    formError.value = err.message || '删除远程失败';
  }
};

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
    resetFormError();
  }
};

const probe = async () => {
  probing.value = true;
  resetFormError();
  try {
    const res = await checkRclone(form.rclonePath);
    probeResult.value = res?.rclone || { ok: false, error: res?.message || '检测失败' };
  } catch (err) {
    probeResult.value = { ok: false, error: err.message };
  } finally {
    probing.value = false;
  }
};

const openAuthorizeUrl = () => {
  if (authorizeUrl.value) {
    openLink(authorizeUrl.value);
  }
};

const openDownloads = () => {
  openLink('https://rclone.org/downloads/');
};

// 冲突两侧的展示信息：备份时间 + 来源机器标识前 8 位
const conflictMetaText = (meta) => {
  if (!meta || (!meta.backupTime && !meta.createdBy)) {
    return '未知';
  }
  const time = meta.backupTime ? formatTime(meta.backupTime) : '时间未知';
  const machine = meta.createdBy ? `（来源 ${String(meta.createdBy).slice(0, 8)}）` : '';
  return `${time}${machine}`;
};

const resolve = async (conflict, mode) => {
  const key = `${conflict.gameId}:${conflict.dir}:${mode}`;
  resolvingKey.value = key;
  formError.value = '';
  try {
    const res = await resolveSyncConflict({ gameId: conflict.gameId, dir: conflict.dir, mode });
    if (!res?.success) {
      formError.value = res?.message || '处理冲突失败';
    }
  } catch (err) {
    formError.value = err.message || '处理冲突失败';
  } finally {
    resolvingKey.value = '';
  }
};

const cancelAuthorize = async () => {
  try {
    await ipc.invoke(`sync-cancel-authorize@${PLUGIN_ID}`);
  } finally {
    authorizeWaiting.value = false;
    creating.value = false;
    formError.value = '授权已取消';
  }
};

const applyCreatedRemote = (remote) => {
  targetByRemote[remote] = remote;
  form.target = remote;
  lastRemoteKey = remote;
  selectedRemote.value = remote;
  view.value = 'main';
};

const createRemoteFromForm = async () => {
  if (!selectedType.value || creating.value || authorizeWaiting.value) {
    return;
  }
  // 编辑时密码留空表示保持不变，必填校验跳过密码字段
  const missing = currentFields.value
    .filter((field) => field.required
      && !(isEditing.value && field.type === 'password')
      && !String(fieldValues[field.key] ?? '').trim())
    .map((field) => field.label);
  if (missing.length > 0) {
    formError.value = `请填写：${missing.join('、')}`;
    return;
  }

  creating.value = true;
  if (currentBackend.value?.auth === 'oauth') {
    authorizeWaiting.value = true;
    authorizeUrl.value = '';
  }
  resetFormError();
  try {
    const res = await ipc.invoke(`sync-create-remote@${PLUGIN_ID}`, {
      type: selectedType.value,
      values: { ...fieldValues },
      editName: isEditing.value ? editingName.value : undefined,
    });
    if (res?.success) {
      formError.value = '';
      editingName.value = '';
      applyCreatedRemote(res.remote);
      loadRemotes();
    } else {
      formError.value = res?.message || '创建远程失败';
    }
  } catch (err) {
    formError.value = err.message || '创建远程失败';
  } finally {
    creating.value = false;
    authorizeWaiting.value = false;
  }
};

/**
 * 连接测试：独立动作，测试已保存的远程与其目标子路径（如 SMB 的共享名，
 * 根路径列举在部分服务器上不校验凭据），结果展示在当前表单页底部
 */
const testRemoteConnection = async () => {
  if (!selectedType.value || testing.value) {
    return;
  }
  testing.value = true;
  testResult.value = null;
  try {
    const prefix = `translime-${selectedType.value}:`;
    const subPath = form.target.startsWith(prefix)
      ? form.target.slice(prefix.length).replace(/^\/+|\/+$/g, '')
      : '';
    const res = await ipc.invoke(`sync-test-remote@${PLUGIN_ID}`, {
      name: `translime-${selectedType.value}`,
      subPath,
    });
    testResult.value = res?.success
      ? (res.connection || { ok: false, error: '测试失败' })
      : { ok: false, error: res?.message || '测试失败' };
    // 自动发现的域回填表单输入框（仅当后端定义了 domain 字段），用户可见可改
    const discoveredDomain = res?.connection?.domain;
    if (discoveredDomain && (currentFields.value || []).some((field) => field.key === 'domain')) {
      fieldValues.domain = discoveredDomain;
    }
  } catch (err) {
    testResult.value = { ok: false, error: err.message || '测试失败' };
  } finally {
    testing.value = false;
  }
};

const syncNow = async () => {
  resetFormError();
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
  resetFormError();
  try {
    const res = await setSyncConfig({ ...form });
    if (!res?.success) {
      formError.value = res?.message || '保存失败';
    } else {
      savedDuringOpen = true;
    }
  } catch (err) {
    formError.value = err.message || '保存失败';
  } finally {
    saving.value = false;
  }
};
</script>
