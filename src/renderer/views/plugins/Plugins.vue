<template>
  <v-container fluid class="plugins">
    <h2>插件</h2>

    <div class="mt-4">
      <div>
        <a @click="openPluginList">查找插件</a>
      </div>
      <div class="mt-2 d-flex align-center">
        <v-text-field
          v-model="search"
          placeholder="输入插件包名"
          append-icon="search"
          solo
          prefix="translime-plugin-"
          @keyup.enter="installPlugins"
          @click.right="showTextEditContextMenu"
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

    <h3>已安装</h3>

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
            :disabled="!!loading.uninstall"
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
import {
  ref,
  reactive,
  onMounted,
  onUnmounted,
} from '@vue/composition-api';
import { storeToRefs } from 'pinia';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useAlert from '@/hooks/useAlert';
import useDialog from '@/hooks/useDialog';
import useGlobalStore from '@/store/globalStore';
import { showTextEditContextMenu } from '@/utils';
import PluginCard from './PluginCard.vue';

export default {
  name: 'Plugins',

  components: {
    PluginCard,
  },

  setup() {
    const ipc = useIpc();
    const store = useGlobalStore();
    const alert = useAlert();
    const dialog = useDialog();
    const loading = reactive({
      install: false,
      uninstall: false,
    });
    const search = ref('');

    const { plugins } = storeToRefs(store);
    const getPlugins = async () => {
      try {
        store.setPlugins(await ipc.invoke(ipcType.GET_PLUGINS));
      } catch (err) {
        alert.show(err.message, 'error');
      }
    };
    const installPlugins = async () => {
      if (!search.value) {
        return;
      }
      if (loading.install) {
        return;
      }
      loading.install = true;
      try {
        const packageName = search.value.startsWith('translime-plugin-')
          ? search.value
          : `translime-plugin-${search.value}`;
        await ipc.invoke(ipcType.INSTALL_PLUGIN, packageName);
        alert.show(`插件 ${packageName} 已安装`);
      } catch (err) {
        alert.show(err.message, 'error');
      } finally {
        loading.install = false;
        getPlugins();
      }
    };
    const uninstallPlugins = async (packageName) => {
      if (!packageName) {
        return;
      }
      if (loading.uninstall) {
        return;
      }
      loading.uninstall = packageName;
      dialog.showLoader();
      try {
        await ipc.invoke(ipcType.UNINSTALL_PLUGIN, packageName);
        alert.show(`插件 ${packageName} 已卸载`);
      } catch (err) {
        alert.show(err.message, 'error');
      } finally {
        loading.uninstall = false;
        dialog.hideLoader();
        getPlugins();
      }
    };
    const enablePlugin = async (packageName) => {
      try {
        await ipc.invoke(ipcType.ENABLE_PLUGIN, packageName);
      } catch (err) {
        alert.show(err.message, 'error');
      } finally {
        getPlugins();
      }
    };
    const disablePlugin = async (packageName) => {
      try {
        await ipc.invoke(ipcType.DISABLE_PLUGIN, packageName);
      } catch (err) {
        alert.show(err.message, 'error');
      } finally {
        getPlugins();
      }
    };

    const openPluginList = () => {
      ipc.invoke(ipcType.OPEN_LINK, { url: 'https://www.npmjs.com/search?q=translime-plugin' });
    };

    onMounted(() => {
      ipc.on(ipcType.PLUGINS_CHANGED, () => {
        getPlugins();
      });
    });

    onUnmounted(() => {
      ipc.detach(ipcType.PLUGINS_CHANGED);
    });

    return {
      plugins,
      getPlugins,
      installPlugins,
      uninstallPlugins,
      enablePlugin,
      disablePlugin,
      search,
      loading,
      showTextEditContextMenu,
      openPluginList,
    };
  },
};
</script>
