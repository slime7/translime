<template>
  <v-container fluid class="setting">
    <h2>设置</h2>

    <h3 class="mt-4">通用</h3>

    <div class="mt-4">
      <v-checkbox
        v-model="settings.openAtLogin"
        label="开机自动启动"
        @change="onOpenAtLogin"
      />
    </div>

    <v-divider />

    <h3 class="mt-4">插件</h3>

    <h5 class="mt-2">npm 服务器</h5>

    <div>
      <v-sheet
        v-for="registry in registryList"
        :key="registry.id"
        class="overflow-hidden rounded mt-2"
      >
        <v-list-item link @click="onSelectRegistry(registry.link, registry.id)">
          <v-list-item-action>
            <v-icon v-if="settings.registry !== registry.link">radio_button_unchecked</v-icon>
            <v-icon color="primary" v-else>radio_button_checked</v-icon>
          </v-list-item-action>

          <v-list-item-content>
            <v-list-item-title>{{ registry.name }}</v-list-item-title>
            <v-list-item-subtitle>{{ registry.link }}</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>
      </v-sheet>

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
import * as ipcType from '@pkg/share/utils/ipcConstant';
import mixins from '@/mixins';
import { useIpc } from '@/hooks/electron';

const ipc = useIpc();
const ipcRaw = useIpc(false);
const appConfigStore = (method, ...args) => ipcRaw.invoke('appConfigStore', method, ...args);

export default {
  name: 'Setting',

  mixins: [mixins],

  data: () => ({
    registryList: [
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
    ],
    customRegistryPanelVisible: false,
    customRegistryPromoteResolve: () => {
    },
  }),

  computed: {
    settings() {
      const { openAtLogin } = this.$store.state.appSetting;
      const { registry } = this.$store.state.appSetting;
      return {
        openAtLogin,
        registry,
      };
    },
    customRegistryItem() {
      return this.registryList.find((item) => item.id === 'custom');
    },
  },

  methods: {
    onOpenAtLogin(value) {
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
      this.$store.commit('setAppOpenAtLogin', value);
    },
    initRegistryLink() {
      if (!this.registryList.find((r) => r.link === this.settings.registry)) {
        this.customRegistryItem.link = this.settings.registry;
      }
    },
    async onSelectRegistry(registry, setType) {
      if (setType !== 'custom') {
        appConfigStore('set', 'setting.registry', registry);
        this.$store.commit('setAppRegistry', registry);
      } else {
        const customRegistryResult = await new Promise((resolve) => {
          this.customRegistryPromoteResolve = resolve;
          this.customRegistryPanelVisible = true;
        });
        if (customRegistryResult) {
          appConfigStore('set', 'setting.registry', this.customRegistryItem.link);
          this.$store.commit('setAppRegistry', this.customRegistryItem.link);
        }
      }
    },
    setCustomRegistryCancel() {
      this.customRegistryPromoteResolve(false);
      this.customRegistryPanelVisible = false;
      this.customRegistryPromoteResolve = () => {};
      this.customRegistryItem.link = '';
    },
    setCustomRegistryConfirm() {
      this.customRegistryPromoteResolve(true);
      this.customRegistryPanelVisible = false;
      this.customRegistryPromoteResolve = () => {};
    },
  },

  mounted() {
    this.initRegistryLink();
  },
};
</script>
