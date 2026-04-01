<template>
  <div class="mb-4 break-inside-avoid w-full max-w-100 mx-auto">
    <div class="text-primary">
      插件域名
    </div>

    <mde-list class="mt-2">
      <mde-list-item
        v-for="registry in registryList"
        :key="registry.id"
        item-type="radio"
        :lines="registry.link ? 'two' : 'one'"
        :title="registry.name"
        :subtitle="registry.link || null"
        :is-active="settings.registry === registry.link"
        @click="onSelectRegistry(registry.link, registry.id)"
      />
    </mde-list>

    <v-dialog
      v-model="customRegistryPanelVisible"
      persistent
      max-width="500px"
    >
      <v-card color="surface-container-high">
        <v-card-title>自定义 npm 域名</v-card-title>

        <v-card-text>
          <v-text-field
            v-model="customRegistryItem.link"
            label="域名"
            placeholder="https://registry.npmjs.org"
            color="primary"
            :rules="registryRules"
            @click.right="showTextEditContextMenu"
          />
        </v-card-text>

        <v-card-actions>
          <v-spacer />

          <v-btn
            color="primary"
            @click="setCustomRegistryCancel"
          >
            取消
          </v-btn>

          <v-btn
            color="primary"
            variant="elevated"
            @click="setCustomRegistryConfirm"
          >
            确定
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import useGlobalStore from '@/store/globalStore';
import { appConfigStore, showTextEditContextMenu } from '@/utils';
import MdeList from '@/components/MdeList.vue';
import MdeListItem from '@/components/MdeListItem.vue';

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
const registryRules = [
  (value) => value.length > 0,
  (value) => /^https?:\/\/.*$/.test(value),
];

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
  customRegistryPromoteResolve.value(true);
  customRegistryPanelVisible.value = false;
  customRegistryPromoteResolve.value = () => {};
};

if (!registryList.find((item) => item.link === settings.registry)) {
  customRegistryItem.value.link = settings.registry;
}
</script>
