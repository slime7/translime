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
            @uninstall="uninstallPlugins"
            @disable="disablePlugin"
            @enable="enablePlugin"
          />
        </v-col>
      </v-row>
    </div>
  </v-container>
</template>

<script>
import * as ipcType from '@pkg/share/utils/ipcConstant';
import mixins from '@/mixins';
import PluginCard from './PluginCard.vue';

export default {
  name: 'Plugins',

  mixins: [mixins],

  components: {
    PluginCard,
  },

  data: () => ({
    loading: {
      install: false,
      uninstall: false,
    },
    search: '',
  }),

  computed: {
    plugins: {
      get() {
        return this.$store.state.plugins;
      },
      set(plugins) {
        this.$store.commit('setPlugins', plugins);
      },
    },
  },

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
        this.alert(err.message, 'error');
      } finally {
        this.loading.install = false;
        this.getPlugins();
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
      this.showLoader();
      try {
        await this.$ipcRenderer.invoke(ipcType.UNINSTALL_PLUGIN, packageName);
      } catch (err) {
        this.alert(err.message, 'error');
      } finally {
        this.loading.uninstall = false;
        this.hideLoader();
        this.getPlugins();
      }
    },
    async getPlugins() {
      try {
        this.plugins = await this.$ipcRenderer.invoke(ipcType.GET_PLUGINS);
      } catch (err) {
        this.alert(err.message, 'error');
      }
    },
    async disablePlugin(packageName) {
      try {
        await this.$ipcRenderer.invoke(ipcType.DISABLE_PLUGIN, packageName);
      } catch (err) {
        this.alert(err.message, 'error');
      } finally {
        this.getPlugins();
      }
    },
    async enablePlugin(packageName) {
      try {
        await this.$ipcRenderer.invoke(ipcType.ENABLE_PLUGIN, packageName);
      } catch (err) {
        this.alert(err.message, 'error');
      } finally {
        this.getPlugins();
      }
    },
  },
};
</script>

<style scoped lang="scss">
</style>
