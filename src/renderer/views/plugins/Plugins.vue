<template>
  <v-container fluid class="plugins">
    <h2>搜索</h2>

    <div class="mt-4">
      <div class="d-flex align-center">
        <v-text-field
          v-model="search"
          label="搜索"
          append-icon="search"
          dense
          solo
          @keyup.enter="installPlugins"
        />

        <v-btn
          class="mb-7 ml-2"
          color="primary"
          :disabled="!search || loading.install"
          :loading="loading.install"
          @click="installPlugins"
        >
          安装插件
        </v-btn>
      </div>
    </div>

    <h2>已安装</h2>

    <div class="mt-4">
      <v-row class="plugin-list">
        <v-col
          sm="12"
          md="6"
          lg="4"
          v-for="pluginItem in plugins"
          :key="pluginItem.packageName"
        >
          <plugin-card
            :plugin="pluginItem"
          />
        </v-col>

        <v-col
          sm="12"
          md="6"
          lg="4"
          v-for="mockPluginIndex in 10"
          :key="`mock-${mockPluginIndex}`"
        >
          <plugin-card
            :plugin="mockPluginData"
          />
        </v-col>

        <v-spacer />
      </v-row>
    </div>
  </v-container>
</template>

<script>
import * as ipcType from '@pkg/share/utils/ipcConstant';
import PluginCard from './PluginCard.vue';

export default {
  name: 'Plugins',

  components: {
    PluginCard,
  },

  data: () => ({
    loading: {
      install: false,
      uninstall: false,
    },
    search: '',
    plugins: [],
    mockPluginData: {
      author: 'mock',
      description: 'plugin description',
      enabled: true,
      link: '',
      main: '',
      packageName: 'translime-plugin-example',
      pluginMenu: [],
      pluginPath: 'C:\\Users\\admin\\AppData\\Roaming\\translime\\plugins\\node_modules\\translime-plugin-example',
      settingMenu: [],
      title: 'mock plugin',
      version: '1.0.0',
      windowMode: false,
    },
  }),

  methods: {
    async installPlugins() {
      if (!this.search) {
        return;
      }
      if (this.loading.install) {
        return;
      }
      this.loading.install = true;
      try {
        const result = await this.$ipcRenderer.invoke(ipcType.INSTALL_PLUGIN, this.search);
        console.log(result);
      } catch (err) {
        console.error(err);
      } finally {
        this.loading.install = false;
      }
    },
    async uninstallPlugins(packageName) {
      if (!packageName) {
        return;
      }
      if (this.loading.uninstall) {
        return;
      }
      this.loading.uninstall = true;
      try {
        const result = await this.$ipcRenderer.invoke(ipcType.UNINSTALL_PLUGIN, packageName);
        console.log(result);
      } catch (err) {
        console.error(err);
      } finally {
        this.loading.uninstall = false;
      }
    },
    async getPlugins() {
      try {
        this.plugins = await this.$ipcRenderer.invoke(ipcType.GET_PLUGINS);
        console.log(this.plugins);
      } catch (err) {
        console.log(err);
      }
    },
  },

  mounted() {
    this.getPlugins();
  },
};
</script>

<style scoped lang="scss">
</style>
