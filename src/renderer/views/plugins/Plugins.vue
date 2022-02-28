<template>
  <v-container fluid class="plugins">
    <h2>搜索</h2>

    <div class="mt-4">
      <div class="d-flex align-center">
        <v-text-field
          v-model="search"
          placeholder="输入插件包名"
          append-icon="search"
          solo
          prefix="translime-plugin-"
          @keyup.enter="installPlugins"
        >
          <template slot="append">
            <v-btn
              color="primary"
              :disabled="!search || loading.install"
              :loading="loading.install"
              @click="installPlugins"
            >
              安装插件
            </v-btn>
          </template>
        </v-text-field>
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
import { useIpc } from '@/hooks/electron';

const ipc = useIpc();

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
        const packageName = this.search.startsWith('translime-plugin-')
          ? this.search
          : `translime-plugin-${this.search}`;
        const result = await ipc.invoke(ipcType.INSTALL_PLUGIN, packageName);
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
        await ipc.invoke(ipcType.UNINSTALL_PLUGIN, packageName);
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
        this.plugins = await ipc.invoke(ipcType.GET_PLUGINS);
      } catch (err) {
        this.alert(err.message, 'error');
      }
    },
    async disablePlugin(packageName) {
      try {
        await ipc.invoke(ipcType.DISABLE_PLUGIN, packageName);
      } catch (err) {
        this.alert(err.message, 'error');
      } finally {
        this.getPlugins();
      }
    },
    async enablePlugin(packageName) {
      try {
        await ipc.invoke(ipcType.ENABLE_PLUGIN, packageName);
      } catch (err) {
        this.alert(err.message, 'error');
      } finally {
        this.getPlugins();
      }
    },
    onPluginsChanged() {
      ipc.on(ipcType.PLUGINS_CHANGED, () => {
        this.getPlugins();
      });
    },
    offPluginChanged() {
      ipc.detach(ipcType.PLUGINS_CHANGED);
    },
  },

  mounted() {
    this.onPluginsChanged();
  },

  destroyed() {
    this.offPluginChanged();
  },
};
</script>
