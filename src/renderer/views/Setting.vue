<template>
  <v-container class="setting">
    <h2>设置</h2>

    <h3 class="mt-4">通用</h3>

    <div>
      <v-checkbox
        class="mt-2"
        :model-value="settings.openAtLogin"
        label="开机自动启动"
        hide-details
        color="primary"
        @update:modelValue="onOpenAtLogin"
      />
    </div>

    <h5 class="mt-2">主题</h5>

    <div>
      <card-radio
        :value="settings.theme === 'light'"
        class="mt-2"
        @click="changeTheme('light')"
      >
        明亮
      </card-radio>
      <card-radio
        :value="settings.theme === 'dark'"
        class="mt-2"
        @click="changeTheme('dark')"
      >
        暗黑
      </card-radio>
      <card-radio
        :value="settings.theme === 'system'"
        class="mt-2"
        @click="changeTheme('system')"
      >
        系统
      </card-radio>
    </div>

    <v-divider class="mt-4" />

    <h3 class="mt-4">插件</h3>

    <h5 class="mt-2">npm 服务器</h5>

    <div>
      <card-radio
        v-for="registry in registryList"
        :key="registry.id"
        :value="settings.registry === registry.link"
        :lines="registry.link ? 'two' : 'one'"
        class="mt-2"
        @click="onSelectRegistry(registry.link, registry.id)"
      >
        {{ registry.name }}
        <template v-slot:subtitle>{{ registry.link }}</template>
      </card-radio>

      <v-dialog
        v-model="customRegistryPanelVisible"
        persistent
        max-width="500px"
      >
        <v-card>
          <v-card-title>自定义 npm 服务器</v-card-title>

          <v-card-text>
            <v-text-field
              v-model="customRegistryItem.link"
              placeholder="https://registry.npmjs.org"
              @click.right="showTextEditContextMenu"
              :rules="[
                v => v.length > 0,
                v => /^https?:\/\/.*$/.test(v)
              ]"
            />
          </v-card-text>

          <v-card-actions>
            <v-spacer />

            <v-btn
              color="primary"
              text
              @click="setCustomRegistryCancel"
            >
              取消
            </v-btn>

            <v-btn
              color="primary"
              text
              @click="setCustomRegistryConfirm"
            >
              确定
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </div>

    <h5 class="mt-4">开发</h5>

    <div>
      <v-switch
        class="mt-2"
        :model-value="settings.showDevPlugin"
        label="显示开发中插件(重启后生效)"
        inset
        hide-details
        color="primary"
        @update:modelValue="onShowDevPlugin"
      />
    </div>

    <div class="mt-4">
      <v-btn @click="showDevtools">打开 devtools(F12)</v-btn>
    </div>
  </v-container>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import useTheme from '@/hooks/useTheme';
import { useIpc } from '@/hooks/electron';
import useGlobalStore from '@/store/globalStore';
import { showTextEditContextMenu, appConfigStore } from '@/utils';
import CardRadio from '@/components/CardRadio.vue';

export default {
  name: 'AppSetting',

  components: {
    CardRadio,
  },

  setup() {
    const ipc = useIpc();
    const theme = useTheme();
    const store = useGlobalStore();

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
    const setAppRegistry = (value) => {
      store.setAppRegistry(value);
    };
    const onSelectRegistry = async (registry, setType) => {
      if (setType !== 'custom') {
        appConfigStore.set('setting.registry', registry);
        setAppRegistry(registry);
      } else {
        const customRegistryResult = await new Promise((resolve) => {
          customRegistryPromoteResolve.value = resolve;
          customRegistryPanelVisible.value = true;
        });
        if (customRegistryResult) {
          appConfigStore.set('setting.registry', customRegistryItem.value.link);
          setAppRegistry(customRegistryItem.value.link);
        }
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

    const setAppOpenAtLogin = (value) => {
      store.setAppOpenAtLogin(value);
    };
    const onOpenAtLogin = (value) => {
      if (value) {
        // 设置开启开机启动
        ipc.send(ipcType.OPEN_AT_LOGIN, {
          open: true,
        });
      } else {
        // 设置关闭开机启动
        ipc.send(ipcType.OPEN_AT_LOGIN, {
          open: false,
        });
      }
      setAppOpenAtLogin(value);
    };

    const onShowDevPlugin = (isShow) => {
      ipc.send(ipcType.SHOW_DEV_PLUGIN, {
        isShow: !!isShow,
      });
      store.setShowDevPlugin(!!isShow);
    };
    const showDevtools = () => {
      ipc.send(ipcType.DEVTOOLS);
    };

    const initRegistryLink = () => {
      if (!registryList.find((r) => r.link === store.appSetting.registry)) {
        customRegistryItem.value.link = store.appSetting.registry;
      }
    };

    onMounted(() => {
      initRegistryLink();
    });

    return {
      settings: store.appSetting,
      registryList,
      customRegistryItem,
      customRegistryPanelVisible,
      customRegistryPromoteResolve,
      onSelectRegistry,
      setCustomRegistryCancel,
      setCustomRegistryConfirm,
      onOpenAtLogin,
      showTextEditContextMenu,
      changeTheme: theme.setTheme,
      onShowDevPlugin,
      showDevtools,
    };
  },
};
</script>

<style scoped lang="scss">
.setting {
  max-width: 800px;
}
</style>
