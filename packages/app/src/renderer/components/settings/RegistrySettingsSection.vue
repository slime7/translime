<template>
  <div class="mb-4 break-inside-avoid w-full max-w-100 mx-auto">
    <div class="text-mat-label-large text-primary">
      插件域名
    </div>

    <mat-list
      variant="segmented"
      interaction="single-action"
      class="settings-list mt-2"
    >
      <mat-list-item
        v-for="registry in registryList"
        :key="registry.id"
        @click="onSelectRegistry(registry.link, registry.id)"
      >
        {{ registry.name }}
        <template v-if="registry.link" #supporting>
          {{ registry.link }}
        </template>
        <template #trailing>
          <mat-radio
            :model-value="settings.registry === registry.link"
            :value="true"
            class="pointer-events-none"
            color="primary"
            aria-hidden="true"
          />
        </template>
      </mat-list-item>
    </mat-list>

    <mat-dialog
      v-model="customRegistryPanelVisible"
      width="500"
      title="自定义 npm 域名"
    >
      <mat-text-field
        v-model="customRegistryItem.link"
        label="域名"
        placeholder="https://registry.npmjs.org"
        color="primary"
        :error="!!registryError"
        :error-text="registryError"
        class="w-full"
        @contextmenu="showTextEditContextMenu"
      />

      <template #actions>
        <div class="grow" />

        <mat-btn
          color="primary"
          variant="text"
          @click="setCustomRegistryCancel"
        >
          取消
        </mat-btn>

        <mat-btn
          color="primary"
          variant="filled"
          @click="setCustomRegistryConfirm"
        >
          确定
        </mat-btn>
      </template>
    </mat-dialog>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import useGlobalStore from '@/store/globalStore';
import { appConfigStore, showTextEditContextMenu } from '@/utils';

const store = useGlobalStore();
const settings = store.appSetting;

const registryList = [
  {
    id: 'taobao',
    name: '淘宝镜像',
    link: 'https://registry.npmmirror.com/',
  },
  {
    id: 'npm',
    name: 'npm 官方仓库',
    link: 'https://registry.npmjs.org/',
  },
  {
    id: 'custom',
    name: '自定义',
    link: '',
  },
];

const customRegistryItem = computed(() => registryList.find((item) => item.id === 'custom'));
const customRegistryPanelVisible = ref(false);
const customRegistryPromoteResolve = ref(() => {});
const registryError = ref('');

const onSelectRegistry = async (registry, setType) => {
  if (setType !== 'custom') {
    appConfigStore.set('setting.registry', registry);
    store.setAppRegistry(registry);
    return;
  }

  const customRegistryResult = await new Promise((resolve) => {
    customRegistryPromoteResolve.value = resolve;
    customRegistryPanelVisible.value = true;
  });

  if (customRegistryResult) {
    appConfigStore.set('setting.registry', customRegistryItem.value.link);
    store.setAppRegistry(customRegistryItem.value.link);
  }
};

const setCustomRegistryCancel = () => {
  customRegistryPromoteResolve.value(false);
  customRegistryPanelVisible.value = false;
  customRegistryPromoteResolve.value = () => {};
  customRegistryItem.value.link = '';
};

const setCustomRegistryConfirm = () => {
  const link = customRegistryItem.value.link || '';
  if (!/^https?:\/\/.*$/.test(link)) {
    registryError.value = '请输入 http(s) 开头的域名';
    return;
  }
  registryError.value = '';
  customRegistryPromoteResolve.value(true);
  customRegistryPanelVisible.value = false;
  customRegistryPromoteResolve.value = () => {};
};

if (!registryList.find((item) => item.link === settings.registry)) {
  customRegistryItem.value.link = settings.registry;
}
</script>

<style scoped>
.settings-list {
  border-radius: 16px;
}
</style>
