<template>
  <mat-dialog
    v-model="visible"
    width="640"
    title="创建开发插件"
  >
    <div class="mb-4 flex items-center gap-2">
      <mat-btn
        toggle
        :selected="mode === 'create'"
        data-test="dev-wizard-mode-create"
        @click="switchMode('create')"
      >
        从模板创建
      </mat-btn>
      <mat-btn
        toggle
        :selected="mode === 'link'"
        data-test="dev-wizard-mode-link"
        @click="switchMode('link')"
      >
        引入已有目录
      </mat-btn>
    </div>

    <!-- 从模板创建：包名 + 元数据 + 存放目录 -->
    <template v-if="mode === 'create'">
      <mat-text-field
        v-model="form.nameSuffix"
        label="插件包名"
        placeholder="my-feature"
        prefix-text="translime-plugin-"
        class="w-full"
        data-test="dev-wizard-name"
      />

      <mat-text-field
        v-model="form.title"
        label="显示标题"
        placeholder="默认由包名生成"
        class="mt-2 w-full"
      />
      <mat-text-field
        v-model="form.description"
        label="功能描述"
        placeholder="默认由标题生成"
        class="mt-2 w-full"
      />

      <div class="mt-3">
        <mat-tooltip
          :content="form.targetRoot || '默认：宿主开发插件目录（plugins_dev）'"
          location="bottom"
        >
          <template #activator>
            <div @click="pickTargetRoot">
              <mat-text-field
                :model-value="form.targetRoot"
                placeholder="选择存放目录；留空则使用宿主开发插件目录"
                readonly
                class="w-full"
              />
            </div>
          </template>
        </mat-tooltip>
        <p class="mt-2 text-mat-body-small text-on-surface-variant">
          将在所选目录下创建 translime-plugin-xxx 子目录，自动链接进宿主并出现在插件列表中
        </p>
      </div>
    </template>

    <!-- 引入已有目录：选择本地插件项目 -->
    <template v-else>
      <mat-tooltip
        :content="form.sourceDir || '未选择'"
        location="bottom"
      >
        <template #activator>
          <div @click="pickSourceDir">
            <mat-text-field
              :model-value="form.sourceDir"
              placeholder="选择插件项目目录（需包含 package.json 与 plugin 字段）"
              readonly
              class="w-full"
              data-test="dev-wizard-source-dir"
            />
          </div>
        </template>
      </mat-tooltip>
      <p class="mt-2 text-mat-body-small text-on-surface-variant">
        目录将被链接进宿主开发插件列表，项目本身仍保留在原位置
      </p>
    </template>

    <div class="mt-5 flex justify-end gap-2">
      <mat-btn
        variant="text"
        data-test="dev-wizard-cancel-btn"
        @click="close"
      >
        取消
      </mat-btn>
      <mat-btn
        color="primary"
        :disabled="!canSubmit || submitting"
        data-test="dev-wizard-submit-btn"
        @click="submit"
      >
        {{ mode === 'create' ? '创建并链接' : '链接插件' }}
      </mat-btn>
    </div>
  </mat-dialog>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useAlert from '@/hooks/useAlert';
import useGlobalStore from '@/store/globalStore';
import { selectFileDialog } from '@/utils';

const CREATE_NAME_SUFFIX_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const ipc = useIpc();
const alert = useAlert();
const store = useGlobalStore();

const emit = defineEmits(['success']);

const visible = ref(false);
const mode = ref('create');
const submitting = ref(false);
const form = reactive({
  nameSuffix: '',
  title: '',
  description: '',
  targetRoot: '',
  sourceDir: '',
});

const open = (nextMode = 'create') => {
  mode.value = nextMode;
  visible.value = true;
};
const close = () => {
  if (submitting.value) {
    return;
  }
  visible.value = false;
};
const switchMode = (nextMode) => {
  if (!submitting.value) {
    mode.value = nextMode;
  }
};
defineExpose({ open });

const canSubmit = computed(() => {
  if (submitting.value) {
    return false;
  }
  if (mode.value === 'create') {
    return CREATE_NAME_SUFFIX_PATTERN.test(form.nameSuffix.trim());
  }
  return Boolean(form.sourceDir);
});

const pickDirectory = async (properties) => {
  const result = await selectFileDialog('app', {
    properties: ['openDirectory', 'dontAddToRecent', ...properties],
  });
  if (result.err || result.canceled || !result.filePaths?.length) {
    return '';
  }
  return result.filePaths[0];
};
const pickTargetRoot = async () => {
  form.targetRoot = await pickDirectory(['createDirectory']);
};
const pickSourceDir = async () => {
  form.sourceDir = await pickDirectory([]);
};

const submit = async () => {
  if (!canSubmit.value) {
    return;
  }
  submitting.value = true;
  try {
    let result;
    if (mode.value === 'create') {
      result = await ipc.invoke(ipcType.CREATE_DEV_PLUGIN, {
        name: `translime-plugin-${form.nameSuffix.trim()}`,
        title: form.title.trim() || undefined,
        description: form.description.trim() || undefined,
        targetRoot: form.targetRoot || undefined,
      });
    } else {
      result = await ipc.invoke(ipcType.LINK_DEV_PLUGIN, {
        sourceDir: form.sourceDir,
      });
    }
    alert.show(`插件 ${result.packageName} 已加入开发插件列表，可启用调试`);
    if (!store.appSetting.showDevPlugin) {
      store.setShowDevPlugin(true);
    }
    emit('success', result.packageName);
    visible.value = false;
  } catch (err) {
    alert.show(err.message, 'error');
  } finally {
    submitting.value = false;
  }
};
</script>
