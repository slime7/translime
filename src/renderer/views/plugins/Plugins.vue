<template>
  <v-container fluid class="plugins">
    <h2>插件</h2>

    <div class="mt-4">
      <div class="mt-2">
        <v-text-field
          v-model="search"
          placeholder="输入插件包名"
          variant="solo"
          density="compact"
          prefix="translime-plugin-"
          @keyup.enter="searchAction"
          @click.right="showTextEditContextMenu"
        >
          <template v-slot:append>
            <v-btn
              class="mt-n2"
              color="primary"
              :disabled="loading.install"
              :loading="loading.install"
              @click="searchAction"
            >
              {{ !search ? '查看插件' : '搜索插件' }}
            </v-btn>
          </template>
        </v-text-field>
      </div>
    </div>

    <template v-if="searchResult.list.length">
      <h3>搜索结果</h3>

      <div class="my-4">
        <v-row class="plugin-list">
          <v-col
            sm="12"
            md="6"
            lg="4"
            v-for="pluginItem in searchResult.list"
            :key="pluginItem.name"
          >
            <plugin-card
              :plugin="pluginItem"
              :disabled="!!loading.uninstall"
              @install="installPlugins"
            />
          </v-col>

          <template v-if="loading.search">
            <v-col
              sm="12"
              md="6"
              lg="4"
              v-for="loadingSkeleton in 4"
              :key="loadingSkeleton"
            >
              <v-skeleton-loader
                elevation="2"
                type="article, actions"
              >
              </v-skeleton-loader>
            </v-col>
          </template>
        </v-row>

        <v-row justify="center">
          <v-col sm="auto">
            <v-btn
              color="primary"
              :disabled="loading.search"
              @click="searchMore"
              v-if="searchResult.total > searchResult.list.length"
            >
              加载更多
            </v-btn>
          </v-col>

          <v-col sm="auto">
            <v-btn
              :disabled="loading.search"
              @click="clearSearchResult"
            >
              清除搜索结果
            </v-btn>
          </v-col>
        </v-row>
      </div>
    </template>

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
} from 'vue';
import { storeToRefs } from 'pinia';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useAlert from '@/hooks/useAlert';
import useDialog from '@/hooks/useDialog';
import axios from '@/hooks/useAxios';
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
      search: false,
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

    const searchResult = reactive({
      list: [],
      total: 0,
    });
    const searchPage = ref(0);
    const parseSearchResult = (item) => ({
      packageName: item.name,
      title: item.name,
      description: item.description,
      author: item.author ? item.author.name : item.publisher.username,
      icon: null,
      version: item.version,
      enabled: false,
      searchResultItem: true,
    });
    const searchRequest = async (q = '', page = 0) => {
      if (loading.search) {
        return;
      }
      loading.search = true;
      try {
        // doc: https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md#get-v1search
        const { data } = await axios('https://registry.npmjs.com/-/v1/search', {
          method: 'get',
          params: {
            text: q ? `translime-plugin-${q}` : 'translime-plugin',
            size: 8,
            from: page,
            x: Math.random(),
          },
        });
        searchResult.list.push(...data.objects.map((item) => parseSearchResult(item.package)));
        searchResult.total = +data.total;
        searchPage.value = page;
      } catch (err) {
        alert.show(err.message, 'error');
      } finally {
        loading.search = false;
      }
    };
    const searchAction = () => {
      if (loading.search) {
        return;
      }
      searchResult.list = [];
      searchRequest(search.value, 0);
    };
    const searchMore = () => {
      if (loading.search) {
        return;
      }
      searchRequest(search.value, searchPage.value + 1);
    };
    const clearSearchResult = () => {
      search.value = '';
      searchResult.list = [];
      searchResult.total = 0;
      searchPage.value = 0;
    };
    const installPlugins = async (certainPackageName = null) => {
      if (loading.install) {
        return;
      }
      loading.install = true;
      try {
        const packageName = certainPackageName || (search.value.startsWith('translime-plugin-') ? search.value : `translime-plugin-${search.value}`);
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
      searchAction,
      searchMore,
      searchResult,
      clearSearchResult,
      loading,
      showTextEditContextMenu,
    };
  },
};
</script>
