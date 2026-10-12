<template>
  <!-- 对话框内容需使用内联样式 -->
  <mat-dialog
    v-model="visible"
    width="560px"
    close-on-back
    title="远程同步"
  >
    <!-- 远程管理视图 -->
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
          正在修改「{{ editingName }}」；更换后端类型请改用「添加存档位置」。
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
          >
            <!-- 字段提示 -->
            <template v-if="field.tooltip" #trailing>
              <mat-tooltip>
                <template #activator>
                  <mat-icon
                    icon="info"
                    size="small"
                    color="on-surface-variant"
                    tabindex="0"
                    aria-label="查看填写说明"
                  />
                </template>
                <template #subhead>
                  {{ field.tooltip.subhead }}
                </template>
                <div style="display: flex; flex-direction: column; gap: 6px; font-size: .75rem; line-height: 1.5">
                  <div v-for="line in field.tooltip.lines" :key="line.title">
                    <span style="font-weight: 600">{{ line.title }}</span>：{{ line.text }}
                  </div>
                </div>
              </mat-tooltip>
            </template>
          </mat-text-field>
        </template>

        <!-- 存档目录：与远程绑定，作为该远程同步的根目录 -->
        <mat-text-field
          v-if="selectedType !== 'local'"
          v-model="rootDir"
          style="width: 100%"
          label="存档目录（可选）"
          placeholder="留空为远程根目录；例如：SteamBackups 或 share/saves"
          variant="outlined"
          color="primary"
        >
          <template #trailing>
            <mat-tooltip>
              <template #activator>
                <mat-icon
                  icon="info"
                  size="small"
                  color="on-surface-variant"
                  tabindex="0"
                  aria-label="查看存档目录说明"
                />
              </template>
              <template #subhead>
                远程内的存档子目录
              </template>
              <div style="display: flex; flex-direction: column; gap: 6px; font-size: .75rem; line-height: 1.5">
                <div>填写远程设备上的相对路径，例如 SteamBackups 或 share/sync/saves。</div>
                <div>留空则直接使用远程的根目录。</div>
              </div>
            </mat-tooltip>
          </template>
        </mat-text-field>

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
          令牌与密码仅保存在本机；同一类型可添加多个存档位置并随时切换。
        </div>

        <div
          v-if="remoteNotice"
          role="status"
          style="font-size: .875rem; color: var(--mat-sys-color-primary); word-break: break-all"
        >
          {{ remoteNotice }}
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

    <!-- 主视图：目标 / 检测 / 状态 -->
    <template v-else>
      <div style="display: flex; flex-direction: column; gap: 16px; padding-bottom: 4px">
        <div style="font-size: .875rem; color: var(--mat-sys-color-on-surface-variant)">
          配置远程位置后，通过「立即同步」或游戏备份弹窗中的「同步」按钮手动对账；同步不会自动运行。
        </div>

        <div style="display: flex; align-items: center; gap: 8px">
          <mat-select
            v-model="selectedRemote"
            label="存档位置"
            :items="remoteItems"
            variant="outlined"
            color="primary"
            placeholder="选择存档位置"
            supporting-text="选中即作为同步目标；本地路径、SMB、网盘均可添加多个随时切换"
            style="flex: 1; min-width: 0"
          />
          <mat-btn
            icon="edit"
            variant="standard"
            size="small"
            aria-label="修改存档位置"
            :disabled="!canEditSelectedRemote"
            @click="openEditRemote"
          />
          <mat-btn
            icon="delete"
            variant="standard"
            size="small"
            color="error"
            aria-label="删除存档位置"
            :disabled="!selectedRemoteInfo"
            @click="askDeleteRemote"
          />
        </div>

        <div style="display: flex; align-items: center; gap: 12px; margin-top: -8px">
          <mat-btn
            variant="text"
            prefix="add"
            @click="openRemoteSetup"
          >
            添加存档位置
          </mat-btn>
          <span style="font-size: .75rem; color: var(--mat-sys-color-on-surface-variant)">
            实际存档目录由所选条目决定，编辑可调整范围
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
            <div style="display: flex; align-items: center; gap: 4px">
              <mat-btn
                v-if="form.rclonePath"
                icon="close"
                variant="standard"
                size="small"
                aria-label="清除 rclone 路径"
                @click.stop="clearRclone"
              />
              <mat-btn
                icon="folder_open"
                variant="standard"
                size="small"
                aria-label="选择 rclone 可执行文件"
                @click.stop="pickRclone"
              />
            </div>
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

        <!-- 同步冲突处理 -->
        <div
          v-if="conflicts.length > 0"
          style="display: flex; flex-direction: column; gap: 12px"
        >
          <div style="font-size: .9375rem; font-weight: 500; color: var(--mat-sys-color-error)">
            检测到 {{ conflicts.length }} 个同步冲突（同名备份在本地与远程内容不同，已跳过自动处理）
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

            <!-- 墓碑冲突处理 -->
            <template v-if="conflict.kind === 'tombstone'">
              <div style="display: flex; flex-direction: column; gap: 2px; font-size: .75rem; color: var(--mat-sys-color-error)">
                <span>远端已删除{{ conflict.remote?.deletedAt ? `（删除时间：${formatTime(conflict.remote.deletedAt)}）` : '' }}，本机这份备份较新，未自动删除</span>
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 4px">
                <mat-btn
                  variant="text"
                  prefix="cloud_upload"
                  :disabled="resolvingKey !== ''"
                  :loading="resolvingKey === `${conflict.gameId}:${conflict.dir}:overwrite-remote`"
                  @click="resolve(conflict, 'overwrite-remote')"
                >
                  恢复本备份
                </mat-btn>
                <mat-btn
                  variant="text"
                  color="error"
                  prefix="delete"
                  :disabled="resolvingKey !== ''"
                  :loading="resolvingKey === `${conflict.gameId}:${conflict.dir}:confirm-deletion`"
                  @click="resolve(conflict, 'confirm-deletion')"
                >
                  确认删除
                </mat-btn>
              </div>
            </template>

            <template v-else>
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
            </template>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px; font-size: .875rem; color: var(--mat-sys-color-on-surface-variant)">
          <span v-if="phase === 'running'">正在同步…</span>
          <span v-else-if="lastRunAt">上次同步：{{ formatTime(lastRunAt) }}</span>
          <span v-else>尚未同步过</span>
          <span v-if="reportSummary">{{ reportSummary }}</span>
          <span
            v-if="lastError && Boolean(selectedRemote)"
            role="alert"
            style="color: var(--mat-sys-color-error); word-break: break-all"
          >
            上次同步失败：{{ lastError }}
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
        :disabled="!canTestConnection || authorizeWaiting"
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
          :disabled="!form.target"
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

// 监听授权链接事件
const ipc = useIpc(PLUGIN_ID);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const form = reactive({ target: '', rclonePath: '' });
const formError = ref('');
const saving = ref(false);
const probing = ref(false);
const probeResult = ref(null);

// 远程管理视图状态
const view = ref('main');
const backends = ref([]);
const remotes = ref([]);
const loadingRemotes = ref(false);
const selectedRemote = ref(null);
const selectedType = ref(null);
const fieldValues = reactive({});
const creating = ref(false);
const authorizeWaiting = ref(false);
const authorizeUrl = ref('');
const resolvingKey = ref('');
// 远程编辑 / 删除 / 连接测试状态
const editingName = ref('');
const deleteConfirm = ref({ show: false });
const testing = ref(false);
const testResult = ref(null);
// 存档目录限制（与远程绑定，随新建/编辑一起提交）
const rootDir = ref('');
// 远程保存成功后的提示（如目标已自动重置为远程根）
const remoteNotice = ref('');

const phase = computed(() => syncStatus.value?.phase || 'idle');
const conflicts = computed(() => syncStatus.value?.conflicts || []);
const lastRunAt = computed(() => syncStatus.value?.lastRunAt || null);
const lastError = computed(() => syncStatus.value?.lastError || null);
const reportSummary = computed(() => {
  const totals = syncStatus.value?.lastReport?.totals;
  if (!totals) {
    return '';
  }
  const parts = [
    `上传 ${totals.uploads}`,
    `下载 ${totals.downloads}`,
    `冲突 ${totals.conflicts ?? 0}`,
  ];
  if (totals.deletions) {
    parts.push(`应用远端删除 ${totals.deletions}`);
  }
  return `上次对账：${parts.join(' · ')}`;
});

const currentBackend = computed(() => backends.value.find((item) => item.id === selectedType.value) || null);
const currentFields = computed(() => currentBackend.value?.fields || []);
const isEditing = computed(() => Boolean(editingName.value));
const backendItems = computed(() => backends.value.map((item) => ({
  title: item.label,
  value: item.id,
  subtitle: item.hint,
})));
// 本地 / 网络路径条目：保存在插件配置中，与 rclone 远程并列
const localTargets = computed(() => syncStatus.value?.config?.localTargets || []);
// Windows 路径大小写不敏感，匹配当前目标时归一比较
const sameLocalPath = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
const selectedIsLocalTarget = computed(() => Boolean(
  selectedRemote.value && localTargets.value.some((dir) => sameLocalPath(dir, selectedRemote.value)),
));
const remoteItems = computed(() => [
  ...localTargets.value.map((dir) => ({
    title: dir,
    value: dir,
    subtitle: '本地 / 网络路径',
  })),
  ...remotes.value.map((remote) => ({
    title: `${remote.name}:`,
    value: `${remote.name}:`,
    subtitle: remote.rootDir ? `/${remote.rootDir}` : undefined,
  })),
]);
const selectedRemoteInfo = computed(() => {
  if (selectedIsLocalTarget.value) {
    return { name: selectedRemote.value, type: 'local' };
  }
  return remotes.value.find((remote) => `${remote.name}:` === selectedRemote.value) || null;
});
// OAuth 远程不可直接编辑凭据
const canEditSelectedRemote = computed(() => {
  if (selectedIsLocalTarget.value) {
    return true;
  }
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
  if (selectedType.value === 'local') {
    return '添加路径';
  }
  return currentBackend.value?.auth === 'oauth' ? '授权并创建' : '创建远程';
});
// 校验测试连接所需基础字段
const canTestConnection = computed(() => {
  if (!selectedType.value || testing.value || authorizeWaiting.value) {
    return false;
  }
  const backend = currentBackend.value;
  if (!backend) {
    return false;
  }
  if (backend.auth === 'oauth') {
    return remotes.value.some((remote) => remote.type === selectedType.value
      && /^translime-/.test(remote.name));
  }
  const hostVal = String(fieldValues.host || '').trim();
  const urlVal = String(fieldValues.url || '').trim();
  const endpointVal = String(fieldValues.endpoint || '').trim();
  const keyVal = String(fieldValues.access_key_id || '').trim();
  const dirVal = String(fieldValues.dir || '').trim();
  return Boolean(hostVal || urlVal || endpointVal || keyVal || dirVal);
});
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

// 受管远程（translime-*）的目录由远程绑定的「存档目录」定义，目标固定为远程根
const isManagedRemoteName = (name) => /^translime-/.test(String(name || ''));

let lastSavedRclonePath = '';

// 目标完全由选中的存档位置条目决定，选择后自动保存生效
watch(selectedRemote, async (value) => {
  form.target = value || '';
  if (value && syncStatus.value?.config?.target !== value) {
    try {
      await setSyncConfig({ ...form, target: value });
    } catch {
      // 忽略自动保存异常，允许手动点击保存
    }
  }
});

watch(visible, async (open) => {
  if (!open) {
    stopCurrentTest();
    return;
  }
  resetFormError();
  probeResult.value = null;
  testResult.value = null;
  remoteNotice.value = '';
  rootDir.value = '';
  view.value = 'main';
  // 获取最新配置并回填表单
  await refreshSyncStatus();
  const config = syncStatus.value?.config;
  form.rclonePath = config?.rclonePath || '';
  lastSavedRclonePath = form.rclonePath;
  // 匹配已保存的目标对应的存档位置（本地条目优先，其次受管远程收敛到根、外部远程精确匹配；
  // 均未命中则视为未选择，由用户重新挑选或添加）
  await Promise.all([loadBackends(), loadRemotes()]);
  const savedTarget = String(config?.target || '');
  const matchedLocal = localTargets.value.find((dir) => sameLocalPath(dir, savedTarget));
  let matchedRemote = null;
  if (!matchedLocal && savedTarget) {
    matchedRemote = remotes.value.find((remote) => (isManagedRemoteName(remote.name)
      ? savedTarget.startsWith(`${remote.name}:`)
      : savedTarget === `${remote.name}:`)) || null;
  }
  // 先复位再选中：目标派生统一由 watch(selectedRemote) 处理
  selectedRemote.value = null;
  selectedRemote.value = matchedLocal
    || (matchedRemote ? `${matchedRemote.name}:` : null);
  form.target = selectedRemote.value || '';
});

watch(selectedType, () => {
  stopCurrentTest();
  resetFormError();
  testResult.value = null;
  remoteNotice.value = '';
  rootDir.value = '';
  Object.keys(fieldValues).forEach((key) => {
    delete fieldValues[key];
  });
  (currentBackend.value?.fields || []).forEach((field) => {
    fieldValues[field.key] = field.default != null ? String(field.default) : '';
  });
});

// 接收 OAuth 授权链接
const onAuthorizeUrl = (payload) => {
  if (payload?.url) {
    authorizeUrl.value = payload.url;
  }
};

onMounted(() => {
  ipc?.on('sync-authorize-url', onAuthorizeUrl);
});

onBeforeUnmount(() => {
  stopCurrentTest();
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
  stopCurrentTest();
  resetFormError();
  testResult.value = null;
  remoteNotice.value = '';
  editingName.value = '';
  selectedType.value = null;
  rootDir.value = '';
  Object.keys(fieldValues).forEach((key) => {
    delete fieldValues[key];
  });
  view.value = 'remote';
  loadBackends();
  loadRemotes();
};

let testToken = 0;
const stopCurrentTest = () => {
  if (testing.value) {
    testing.value = false;
    testToken += 1;
    ipc?.invoke(`sync-cancel-test-remote@${PLUGIN_ID}`).catch(() => {});
  }
};

const backToMain = () => {
  if (authorizeWaiting.value) {
    return;
  }
  stopCurrentTest();
  resetFormError();
  testResult.value = null;
  remoteNotice.value = '';
  rootDir.value = '';
  editingName.value = '';
  selectedType.value = null;
  Object.keys(fieldValues).forEach((key) => {
    delete fieldValues[key];
  });
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
  remoteNotice.value = '';
  view.value = 'remote';
  await loadBackends();
  // 本地 / 网络路径条目：路径即存档根，直接回填，无 rclone 配置可读
  if (info.type === 'local') {
    editingName.value = info.name;
    selectedType.value = 'local';
    await nextTick();
    fieldValues.dir = info.name;
    rootDir.value = '';
    return;
  }
  try {
    const res = await ipc.invoke(`sync-get-remote@${PLUGIN_ID}`, { name: info.name });
    if (!res?.success) {
      // 保持在当前视图展示错误
      formError.value = res?.message || '读取远程配置失败';
      return;
    }
    editingName.value = info.name;
    selectedType.value = res.remote.type;
    // 回填远程配置到表单
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
    // 存档目录在字段回填之后设置（selectedType 的 watch 会先重置它）
    rootDir.value = String(res.remote.rootDir || '');
  } catch (err) {
    formError.value = err.message || '读取远程配置失败';
  }
};

const askDeleteRemote = () => {
  const info = selectedRemoteInfo.value;
  if (!info) {
    return;
  }
  const isLocal = info.type === 'local';
  deleteConfirm.value = {
    show: true,
    title: isLocal ? '移除本地路径' : '删除远程',
    icon: 'delete',
    color: 'error',
    message: isLocal
      ? `确定要移除本地路径「${info.name}」吗？`
      : `确定要删除远程「${info.name}」吗？`,
    detail: isLocal
      ? '仅从存档位置列表移除，不会删除目录内的任何文件。'
      : '只删除本机 rclone 配置中的连接凭据，不会删除已同步到远端的存档数据。',
    confirmText: isLocal ? '确认移除' : '确认删除',
  };
};

const removeRemote = async () => {
  const info = selectedRemoteInfo.value;
  if (!info) {
    return;
  }
  deleteConfirm.value = { ...deleteConfirm.value, loading: true };
  try {
    const res = await ipc.invoke(`sync-delete-remote@${PLUGIN_ID}`, {
      name: info.name,
      local: info.type === 'local' || undefined,
    });
    deleteConfirm.value = { ...deleteConfirm.value, show: false, loading: false };
    if (res?.success) {
      // 成功删除当前所选条目：立即清空选中项与目标，避免残留失效目标
      form.target = '';
      selectedRemote.value = null;
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

const onRclonePathChanged = async (newPath) => {
  if (newPath === lastSavedRclonePath) {
    return;
  }
  try {
    const res = await setSyncConfig({ rclonePath: newPath });
    if (res?.success) {
      lastSavedRclonePath = newPath;
      await probe();
      if (remotes.value.length === 0) {
        await loadRemotes();
      }
    } else {
      formError.value = res?.message || '保存 rclone 路径失败';
    }
  } catch (err) {
    formError.value = err.message || '保存 rclone 路径失败';
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
    const [selectedPath] = result.filePaths;
    if (selectedPath !== form.rclonePath) {
      form.rclonePath = selectedPath;
      resetFormError();
      await onRclonePathChanged(selectedPath);
    }
  }
};

const clearRclone = async () => {
  if (form.rclonePath !== '') {
    form.rclonePath = '';
    resetFormError();
    await onRclonePathChanged('');
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

// 格式化冲突展示信息
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

const applyCreatedRemote = async (remote) => {
  form.target = remote;
  selectedRemote.value = remote;
  try {
    await setSyncConfig({ ...form, target: remote });
  } catch {
    // 忽略自动保存异常，返回主视图后仍可手动点击保存
  }
  view.value = 'main';
};

const createRemoteFromForm = async () => {
  if (!selectedType.value || creating.value || authorizeWaiting.value) {
    return;
  }
  // 编辑时密码留空表示保持不变
  const missing = currentFields.value
    .filter((field) => field.required
      && !(isEditing.value && field.type === 'password')
      && !String(fieldValues[field.key] ?? '').trim())
    .map((field) => field.label);
  if (missing.length > 0) {
    formError.value = `请填写：${missing.join('、')}`;
    return;
  }

  stopCurrentTest();
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
      rclonePath: form.rclonePath || undefined,
      rootDir: String(rootDir.value || '').trim() || undefined,
    });
    if (res?.success) {
      formError.value = '';
      editingName.value = '';
      // 刷新配置：本地条目列表需最新值，选中态与目标锁定才能正确生效
      await refreshSyncStatus();
      applyCreatedRemote(res.remote);
      if (res.targetAdjusted) {
        // 主进程已把带子路径的旧目标收敛，回填并提示
        remoteNotice.value = selectedType.value === 'local'
          ? '原目标已更新为新的本地路径'
          : `已设为存档位置「${res.remote}」`;
      } else {
        remoteNotice.value = '';
      }
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
 * 连接测试：独立动作，支持基于当前表单填写内容进行即时测试，结果展示在当前表单页底部
 */
const testRemoteConnection = async () => {
  if (!canTestConnection.value || testing.value) {
    return;
  }
  testing.value = true;
  testResult.value = null;
  const currentToken = ++testToken;
  try {
    const res = await ipc.invoke(`sync-test-remote@${PLUGIN_ID}`, {
      type: selectedType.value,
      values: { ...fieldValues },
      name: isEditing.value ? editingName.value : `translime-${selectedType.value}`,
      rclonePath: form.rclonePath || undefined,
      rootDir: String(rootDir.value || '').trim() || undefined,
    });
    if (testToken !== currentToken) {
      return;
    }
    testResult.value = res?.success
      ? (res.connection || { ok: false, error: '测试失败' })
      : { ok: false, error: res?.message || '测试失败' };
    // 回填自动检测到的域
    const discoveredDomain = res?.connection?.domain;
    if (discoveredDomain && (currentFields.value || []).some((field) => field.key === 'domain')) {
      fieldValues.domain = discoveredDomain;
    }
  } catch (err) {
    if (testToken !== currentToken) {
      return;
    }
    testResult.value = { ok: false, error: err.message || '测试失败' };
  } finally {
    if (testToken === currentToken) {
      testing.value = false;
    }
  }
};

const syncNow = async () => {
  if (!form.target) {
    return;
  }
  resetFormError();
  // 若当前选中的目标尚未保存，先自动保存生效再执行同步
  if (syncStatus.value?.config?.target !== form.target) {
    try {
      const saveRes = await setSyncConfig({ ...form });
      if (!saveRes?.success) {
        formError.value = saveRes?.message || '保存设置失败';
        return;
      }
      lastSavedRclonePath = form.rclonePath;
    } catch (e) {
      formError.value = e.message || '保存设置失败';
      return;
    }
  }
  const res = await triggerSyncNow();
  if (!res?.success) {
    formError.value = res?.message || '触发同步失败';
  }
};

const cancel = async () => {
  await cancelSync();
};

const save = async () => {
  saving.value = true;
  resetFormError();
  try {
    const res = await setSyncConfig({ ...form });
    if (res?.success) {
      lastSavedRclonePath = form.rclonePath;
    } else {
      formError.value = res?.message || '保存失败';
    }
  } catch (err) {
    formError.value = err.message || '保存失败';
  } finally {
    saving.value = false;
  }
};
</script>
