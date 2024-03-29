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
              color="primary"
              :disabled="loading.install || loading.search"
              :loading="loading.install || loading.search"
              @click="searchAction"
            >
              {{ !search ? '查看插件' : '搜索插件' }}
            </v-btn>

            <v-btn
              class="ml-2"
              density="comfortable"
              icon="folder_zip"
              @click="installLocalPluginDialog.open()"
            ></v-btn>
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
              :disabled="!!loading.install"
              @install="installPlugins"
            />
          </v-col>

          <template v-if="loading.search">
            <div class="w-100 my-2 d-flex justify-center">
              <v-progress-circular color="primary" indeterminate></v-progress-circular>
            </div>
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
            :disabled="!!loading.uninstall || !!loading.install"
            ref="pluginCardRefs"
            @install="installPlugins"
            @uninstall="uninstallPlugins"
            @disable="disablePlugin"
            @enable="enablePlugin"
          />
        </v-col>
      </v-row>
    </div>

    <v-dialog
      v-model="installLocalPluginDialog.visible"
      max-width="600"
    >
      <v-card>
        <v-card-text>
          <v-tooltip
            :text="installLocalPluginDialog.filepath || '未选择'"
            location="bottom"
          >
            <template v-slot:activator="{ props }">
              <v-text-field
                v-bind="props"
                :value="installLocalPluginDialog.filepath"
                placeholder="选择本地的插件包文件"
                :readonly="true"
                @click:control="selectPluginFile()"
              />
            </template>
          </v-tooltip>

          <div class="mt-2 d-flex justify-center">
            <v-btn
              color="primary"
              rounded
              :disabled="!installLocalPluginDialog.filepath"
              @click="installLocalPlugins"
            >
              安装这个插件
            </v-btn>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script>
import {
  ref,
  reactive,
  onActivated,
  onMounted,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useAlert from '@/hooks/useAlert';
import useDialog from '@/hooks/useDialog';
import useAxios from '@/hooks/useAxios';
import useGlobalStore from '@/store/globalStore';
import { showTextEditContextMenu, selectFileDialog } from '@/utils';
import PluginCard from './PluginCard.vue';

export default {
  name: 'PluginsMain',

  components: {
    PluginCard,
  },

  setup() {
    const ipc = useIpc();
    const store = useGlobalStore();
    const alert = useAlert();
    const dialog = useDialog();
    const axios = useAxios();
    const route = useRoute();
    const router = useRouter();
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

    const installLocalPluginDialog = ref({
      visible: false,
      filepath: '',
      errorMsg: '',
      open: () => {
        installLocalPluginDialog.value.visible = true;
      },
      close: () => {
        installLocalPluginDialog.value.visible = false;
      },
    });
    const windowOpenDialogShow = ref(false);
    const selectPluginFile = async () => {
      if (windowOpenDialogShow.value) {
        return;
      }
      installLocalPluginDialog.value.errorMsg = '';
      windowOpenDialogShow.value = true;
      const result = await selectFileDialog('app', {
        filters: [
          { name: '插件包', extensions: ['tgz', 'tar.gz'] },
        ],
        properties: ['openFile', 'dontAddToRecent'],
      });
      windowOpenDialogShow.value = false;
      if (result.err) {
        installLocalPluginDialog.value.errorMsg = '读取文件出错';
      } else if (!result.data.canceled) {
        [installLocalPluginDialog.value.filepath] = result.data.filePaths;
      }
    };
    const installLocalPlugins = async () => {
      if (loading.install) {
        return;
      }
      if (!installLocalPluginDialog.value.filepath) {
        return;
      }
      installLocalPluginDialog.value.close();
      loading.install = true;
      try {
        await ipc.invoke(ipcType.INSTALL_LOCAL_PLUGIN, installLocalPluginDialog.value.filepath);
        installLocalPluginDialog.value.filepath = '';
        alert.show('本地插件已安装');
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

    const pluginCardRefs = ref(null);

    const openPluginSettingPanel = () => {
      const query = { ...route.query };
      const settingPluginId = query.setting;
      if (settingPluginId && pluginCardRefs.value && pluginCardRefs.value.length) {
        const findPluginRef = pluginCardRefs.value.find((r) => r.pluginId === settingPluginId);
        if (findPluginRef) {
          findPluginRef.showSettingPanel();
          delete query.setting;
          router.replace({
            query,
          });
        }
      }
    };
    const installPluginConfirm = async () => {
      // 处理来自 deep link 的插件安装请求
      const query = { ...route.query };
      const willInstallPluginId = query.install;
      if (willInstallPluginId?.startsWith('translime-plugin-')) {
        const result = await dialog.showConfirm(`确定要安装来自点击链接的插件"${willInstallPluginId}"吗`, '安装插件');
        delete query.install;
        router.replace({
          query,
        });
        if (result.confirm) {
          installPlugins(willInstallPluginId);
        }
      }
    };
    watch(() => route.query.t, () => {
      // 另一个打开设置面板指令
      openPluginSettingPanel();
      installPluginConfirm();
    });
    onActivated(() => {
      openPluginSettingPanel();
      installPluginConfirm();
    });
    const checkUpdate = () => {
      if (pluginCardRefs.value && pluginCardRefs.value.length) {
        pluginCardRefs.value.forEach((plugin) => {
          plugin.getVersions();
        });
      }
    };

    onMounted(() => {
      checkUpdate();
    });

    return {
      plugins,
      getPlugins,
      installPlugins,
      installLocalPluginDialog,
      selectPluginFile,
      installLocalPlugins,
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
      pluginCardRefs,
    };
  },
};
</script>
