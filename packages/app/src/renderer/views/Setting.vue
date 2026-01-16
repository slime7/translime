<template>
  <v-container class="setting">
    <div class="text-center text-5xl">
      设置
    </div>

    <div class="mt-4 columns-1 lg:columns-2 gap-4 mx-auto max-w-204">
      <div class="mb-4 break-inside-avoid w-full max-w-100 mx-auto">
        <div class="text-primary">
          通用
        </div>

        <v-card
          class="mt-2 rounded-[16px]"
          rounded
          variant="flat"
          color="transparent"
        >
          <v-list
            class="py-0"
            indent="4"
            bg-color="transparent"
          >
            <v-list-item
              title="开机自动启动"
              density="comfortable"
              base-color="primary"
              rounded
              link
              active
              @click="onOpenAtLogin(!settings.openAtLogin)"
            >
              <template #append>
                <v-switch
                  :model-value="settings.openAtLogin"
                  color="primary"
                  density="compact"
                  hide-details
                  readonly
                />
              </template>
            </v-list-item>

            <v-list-item
              title="显示开发中插件(重启后生效)"
              density="comfortable"
              class="mt-1"
              base-color="primary"
              rounded
              link
              active
              @click="onShowDevPlugin(!settings.showDevPlugin)"
            >
              <template #append>
                <v-switch
                  :model-value="settings.showDevPlugin"
                  color="primary"
                  density="compact"
                  hide-details
                  readonly
                />
              </template>
            </v-list-item>
          </v-list>
        </v-card>

        <v-card
          class="mt-2 rounded-[16px]"
          rounded
          variant="flat"
          color="transparent"
        >
          <v-list
            class="py-0"
            indent="4"
            bg-color="transparent"
          >
            <v-list-item
              title="打开 devtools(F12)"
              density="comfortable"
              rounded
              link
              active
              @click="showDevtools"
            />

            <v-list-item
              title="重新启动"
              density="comfortable"
              class="mt-1"
              rounded
              link
              active
              @click="relaunch"
            />
          </v-list>
        </v-card>
      </div>

      <div class="mb-4 break-inside-avoid w-full max-w-100 mx-auto">
        <div class="text-primary">
          插件域名
        </div>

        <v-card
          class="mt-2 rounded-[16px]"
          rounded
          variant="flat"
          color="transparent"
        >
          <v-list
            class="py-0"
            indent="4"
            bg-color="transparent"
            selectable
            mandatory
          >
            <v-list-item
              v-for="(registry, index) in registryList"
              :key="registry.id"
              :class="[settings.registry === registry.link ? 'rounded-[16px]' : 'rounded-[4px]', { 'mt-1': index > 0 }]"
              :lines="registry.link ? 'two' : 'one'"
              :title="registry.name"
              :subtitle="registry.link || null"
              density="comfortable"
              rounded
              link
              :base-color="settings.registry === registry.link ? 'secondary' : 'primary'"
              active
              @click="onSelectRegistry(registry.link, registry.id)"
            >
              <template #prepend>
                <v-radio
                  :model-value="settings.registry === registry.link"
                  class="mr-4"
                  color="primary"
                  density="compact"
                  hide-details
                  readonly
                />
              </template>
            </v-list-item>
          </v-list>
        </v-card>
      </div>

      <div class="mb-4 break-inside-avoid w-full max-w-100 mx-auto">
        <div class="text-primary">
          外观
        </div>

        <v-card
          class="mt-2 rounded-[16px]"
          rounded
          variant="flat"
          color="transparent"
        >
          <v-list
            class="py-0"
            indent="4"
            bg-color="transparent"
            selectable
            mandatory
          >
            <v-list-item
              :class="[settings.theme === 'light' ? 'rounded-[16px]' : 'rounded-[4px]']"
              title="明亮"
              density="comfortable"
              rounded
              link
              :base-color="settings.theme === 'light' ? 'secondary' : 'primary'"
              active
              @click="changeTheme('light')"
            >
              <template #prepend>
                <v-radio
                  :model-value="settings.theme === 'light'"
                  class="mr-4"
                  color="primary"
                  density="compact"
                  hide-details
                  readonly
                />
              </template>
            </v-list-item>

            <v-list-item
              class="mt-1"
              :class="[settings.theme === 'dark' ? 'rounded-[16px]' : 'rounded-[4px]']"
              title="暗黑"
              density="comfortable"
              rounded
              link
              :base-color="settings.theme === 'dark' ? 'secondary' : 'primary'"
              active
              @click="changeTheme('dark')"
            >
              <template #prepend>
                <v-radio
                  :model-value="settings.theme === 'dark'"
                  class="mr-4"
                  color="primary"
                  density="compact"
                  hide-details
                  readonly
                />
              </template>
            </v-list-item>

            <v-list-item
              class="mt-1"
              :class="[settings.theme === 'system' ? 'rounded-[16px]' : 'rounded-[4px]']"
              title="系统"
              density="comfortable"
              rounded
              link
              :base-color="settings.theme === 'system' ? 'secondary' : 'primary'"
              active
              @click="changeTheme('system')"
            >
              <template #prepend>
                <v-radio
                  :model-value="settings.theme === 'system'"
                  class="mr-4"
                  color="primary"
                  density="compact"
                  hide-details
                  readonly
                />
              </template>
            </v-list-item>
          </v-list>
        </v-card>

        <v-card
          class="mt-2 rounded-[16px]"
          rounded
          variant="flat"
          color="transparent"
        >
          <v-list
            class="py-0"
            indent="4"
            bg-color="transparent"
            selectable
            mandatory
          >
            <v-list-item
              title="使用系统标题栏(重启后生效)"
              density="comfortable"
              base-color="primary"
              rounded
              link
              active
              @click="onUseNativeTitleBar(!settings.useNativeTitleBar)"
            >
              <template #append>
                <v-switch
                  :model-value="settings.useNativeTitleBar"
                  color="primary"
                  density="compact"
                  hide-details
                  readonly
                />
              </template>
            </v-list-item>
          </v-list>
        </v-card>
      </div>
    </div>

    <div>
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
  </v-container>
</template>

<script>
import {
  computed,
  onMounted,
  ref,
  watch,
} from 'vue';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import useTheme from '@/hooks/useTheme';
import { useIpc } from '@/hooks/electron';
import useGlobalStore from '@/store/globalStore';
import { appConfigStore, showTextEditContextMenu } from '@/utils';

export default {
  name: 'AppSetting',

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
    const relaunch = () => {
      ipc.send(ipcType.RELAUNCH);
    };

    const initRegistryLink = () => {
      if (!registryList.find((r) => r.link === store.appSetting.registry)) {
        customRegistryItem.value.link = store.appSetting.registry;
      }
    };

    // 原生标题栏设置
    const useNativeTitleBarNext = ref(store.appSetting.useNativeTitleBar);
    watch(() => store.appSetting.useNativeTitleBar, () => {
      useNativeTitleBarNext.value = store.appSetting.useNativeTitleBar;
    });
    const setUseNativeTitleBar = (value) => {
      store.setUseNativeTitleBar(value);
    };
    const onUseNativeTitleBar = (v) => {
      setUseNativeTitleBar(!!v);
      appConfigStore.set('setting.useNativeTitleBar', !!v);
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
      relaunch,
      useNativeTitleBarNext,
      onUseNativeTitleBar,
    };
  },
};
</script>

<style scoped lang="scss">
</style>
