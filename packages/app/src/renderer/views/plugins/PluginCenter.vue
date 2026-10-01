<template>
  <mat-container fluid class="plugin-center">
    <h2 class="text-mat-headline-large">
      插件中心
    </h2>

    <!-- 搜索与安装入口：直接置于页面背景上，不使用容器包裹；不换行，搜索框随宽度收缩 -->
    <div class="mt-4 flex items-center gap-2">
      <mat-search
        v-model="search"
        data-test="plugin-search-input"
        class="center-search"
        label="搜索插件"
        placeholder="过滤当前页签；市场页签回车查询，留空列出全部插件"
        @search="searchAction"
        @contextmenu="showTextEditContextMenu"
      >
        <template #trailing>
          <mat-btn
            v-if="search || searchResult.list.length"
            icon="close"
            label="清空搜索"
            variant="standard"
            size="small"
            data-test="plugin-search-clear-btn"
            @click="clearSearchResult"
          />
        </template>
      </mat-search>

      <mat-btn
        icon="add_circle"
        label="创建开发插件"
        data-test="plugin-create-dev-btn"
        @click="devPluginWizardRef?.open('create')"
      />

      <mat-btn
        icon="folder_zip"
        label="安装本地插件"
        data-test="plugin-install-local-btn"
        :disabled="!!loading.install"
        @click="installLocalPluginDialog.open()"
      />

      <mat-btn
        icon="refresh"
        label="刷新开发中插件"
        data-test="plugin-refresh-btn"
        :disabled="loading.refresh"
        @click="refreshDevPlugins"
      />
    </div>

    <!-- 工具栏分页：已安装 / 市场 页签，带数量徽标 -->
    <div class="mt-3 flex items-center gap-2">
      <mat-btn
        toggle
        :selected="activeTab === 'installed'"
        data-test="plugin-tab-installed"
        @click="switchToInstalled"
      >
        已安装 {{ plugins.length }}
      </mat-btn>

      <mat-btn
        toggle
        :selected="activeTab === 'search'"
        data-test="plugin-tab-search"
        @click="switchToSearch"
      >
        搜索结果
      </mat-btn>
    </div>

    <!-- 搜索结果页签：npm 搜索结果以 list 呈现，限宽居中并保留分页 -->
    <section
      v-if="activeTab === 'search'"
      class="mt-6"
    >
      <template v-if="searchVisible">
        <mat-list
          v-if="filteredSearchResults.length"
          class="mx-auto mt-3 max-w-3xl"
          aria-label="插件市场搜索结果"
        >
          <mat-list-item
            v-for="pluginItem in filteredSearchResults"
            :key="pluginItem.packageName"
            :lines="2"
          >
            <template #leading>
              <mat-avatar
                v-if="pluginItem.icon"
                :src="pluginItem.icon"
                size="40"
              />
              <mat-avatar
                v-else
                icon="extension"
                size="40"
              />
            </template>

            {{ pluginItem.title }}

            <template #supporting>
              <span class="search-item-description">{{ pluginItem.description }}</span>
              <span class="search-item-meta">
                {{ pluginItem.author }} · v{{ pluginItem.version }}<template v-if="isInstalled(pluginItem)"> · 已安装</template>
              </span>
            </template>

            <template #trailing>
              <div class="flex items-center gap-2">
                <mat-select
                  v-if="pluginItem.versions?.length"
                  v-model="selectedVersions[pluginItem.packageName]"
                  class="search-version-select shrink-0"
                  :items="versionListFor(pluginItem)"
                  label="版本"
                />

                <mat-btn
                  v-if="!isInstalled(pluginItem)"
                  variant="filled"
                  color="primary"
                  data-test="plugin-search-install-btn"
                  :disabled="!!loading.install"
                  @click="installPlugins(withVersion(pluginItem))"
                >
                  安装
                </mat-btn>

                <mat-btn
                  v-else-if="canUpdated(pluginItem)"
                  variant="filled"
                  :color="STATUS_SUCCESS"
                  data-test="plugin-search-upgrade-btn"
                  :disabled="!!loading.install"
                  @click="installPlugins(withVersion(pluginItem))"
                >
                  升级
                </mat-btn>

                <mat-btn
                  v-else
                  variant="filled-tonal"
                  data-test="plugin-search-reinstall-btn"
                  :disabled="!!loading.install"
                  @click="installPlugins(withVersion(pluginItem))"
                >
                  重新安装
                </mat-btn>
              </div>
            </template>
          </mat-list-item>
        </mat-list>

        <div
          v-if="searchLoading"
          class="mt-4 flex justify-center"
        >
          <mat-progress
            variant="circular"
            indeterminate
            color="primary"
          />
        </div>

        <p
          v-else-if="!filteredSearchResults.length"
          class="mt-4 text-center text-mat-body-large text-on-surface-variant"
        >
          未找到匹配的插件
        </p>

        <div
          v-if="searchResult.list.length && searchResult.total > (searchPage + 1) * SEARCH_PAGE_SIZE"
          class="mt-5 flex justify-center"
        >
          <mat-btn
            color="primary"
            :disabled="searchLoading"
            data-test="plugin-search-more-btn"
            @click="searchMore"
          >
            加载更多
          </mat-btn>
        </div>
      </template>

      <div
        v-else
        class="flex flex-col items-center justify-center py-16"
      >
        <div class="mb-4 size-20 rounded-full bg-surface-container-highest flex items-center justify-center">
          <mat-icon class="text-4xl text-on-surface-variant">
            storefront
          </mat-icon>
        </div>
        <p class="text-mat-title-large mb-2">
          插件市场
        </p>
        <p class="text-mat-body-large text-on-surface-variant">
          在上方输入关键词搜索插件市场，回车确认
        </p>
      </div>
    </section>

    <!-- 已安装页签：全量插件库存，卡片网格随宽度调整列数；搜索框同时作为本地即时过滤 -->
    <section
      v-show="activeTab === 'installed'"
      class="mt-6"
    >
      <div class="flex items-baseline justify-between">
        <h3 class="text-mat-title-large">
          已安装
        </h3>
        <span
          v-if="search"
          class="text-mat-body-medium text-on-surface-variant"
        >
          正在按「{{ search }}」过滤
        </span>
      </div>

      <div
        v-if="installedPlugins.length"
        class="mt-3 grid grid-cols-1 gap-3 md:gap-4 min-[800px]:grid-cols-2 xl:grid-cols-3 xxl:grid-cols-4"
      >
        <plugin-card
          v-for="pluginItem in installedPlugins"
          :key="pluginItem.packageName"
          ref="pluginCardRefs"
          :plugin="pluginItem"
          :disabled="!!loading.uninstall || !!loading.install"
          @install="installPlugins"
          @uninstall="uninstallPlugins"
          @disable="disablePlugin"
          @enable="enablePlugin"
        />
      </div>

      <p
        v-else-if="search"
        class="mt-3 text-mat-body-large text-on-surface-variant"
      >
        没有匹配的已安装插件
      </p>

      <div
        v-else
        class="flex flex-col items-center justify-center py-16"
      >
        <div class="mb-4 size-20 rounded-full bg-surface-container-highest flex items-center justify-center">
          <mat-icon class="text-4xl text-on-surface-variant">
            extension
          </mat-icon>
        </div>
        <p class="text-mat-title-large mb-2">
          尚未安装插件
        </p>
        <p class="text-mat-body-large text-on-surface-variant">
          在上方搜索插件市场，或点击工具栏安装本地插件包
        </p>
      </div>
    </section>

    <dev-plugin-wizard
      ref="devPluginWizardRef"
      @success="getPlugins"
    />

    <mat-dialog
      v-model="installLocalPluginDialog.visible"
      width="600"
      title="安装本地插件"
    >
      <mat-tooltip
        :content="installLocalPluginDialog.filepath || '未选择'"
        location="bottom"
      >
        <template #activator>
          <div @click="selectPluginFile()">
            <mat-text-field
              :model-value="installLocalPluginDialog.filepath"
              placeholder="选择本地的插件包文件"
              readonly
              class="w-full"
            />
          </div>
        </template>
      </mat-tooltip>

      <div class="mt-2 flex justify-center">
        <mat-btn
          color="primary"
          :disabled="!installLocalPluginDialog.filepath"
          @click="installLocalPlugins"
        >
          安装这个插件
        </mat-btn>
      </div>
    </mat-dialog>
  </mat-container>
</template>

<script setup>
import {
  onActivated,
  reactive,
  ref,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useAlert from '@/hooks/useAlert';
import useDialog from '@/hooks/useDialog';
import useGlobalStore from '@/store/globalStore';
import { selectFileDialog, showTextEditContextMenu } from '@/utils';
import { STATUS_SUCCESS } from '@/utils/statusColors';
import PluginCard from './PluginCard.vue';
import DevPluginWizard from './DevPluginWizard.vue';
import usePluginCenterSearch, { parseSearchResult, SEARCH_PAGE_SIZE } from './hooks/usePluginCenterSearch';

const ipc = useIpc();
const store = useGlobalStore();
const alert = useAlert();
const dialog = useDialog();
const route = useRoute();
const router = useRouter();

const loading = reactive({
  install: false,
  uninstall: false,
  refresh: false,
});

const { plugins } = storeToRefs(store);

const {
  search,
  searchLoading,
  searchResult,
  searchPage,
  selectedVersions,
  activeTab,
  searchVisible,
  filteredSearchResults,
  installedPlugins,
  versionListFor,
  withVersion,
  isInstalled,
  canUpdated,
  getPluginDetail,
  searchAction,
  searchMore,
  clearSearchResult,
  switchToSearch,
  switchToInstalled,
} = usePluginCenterSearch();

const checkPluginUpdates = async () => {
  // 对所有非 dev 插件进行更新检查
  plugins.value.forEach(async (p) => {
    if (p.dev) return;
    try {
      const detail = await getPluginDetail(p.packageName);
      if (detail) {
        const searchItem = parseSearchResult(detail);
        store.updatePlugin(p.packageName, {
          versions: searchItem.versions,
        });
      }
    } catch (err) {
      // 单个检查失败不影响整体
      console.error(`Check update failed for ${p.packageName}`, err);
    }
  });
};

const getPlugins = async () => {
  try {
    const pluginsData = await ipc.invoke(ipcType.GET_PLUGINS);
    store.setPlugins(pluginsData);
    checkPluginUpdates();
  } catch (err) {
    alert.show(err.message, 'error');
  }
};

const installPlugins = async (certainPackageName = null) => {
  if (loading.install) {
    return;
  }
  loading.install = true;
  dialog.showLoader();
  try {
    const packageName = certainPackageName || (search.value.startsWith('translime-plugin-') ? search.value : `translime-plugin-${search.value}`);
    await ipc.invoke(ipcType.INSTALL_PLUGIN, packageName);
    delete selectedVersions[String(packageName).split('@')[0]];
    alert.show(`插件 ${packageName} 已安装`);
  } catch (err) {
    alert.show(err.message, 'error');
  } finally {
    loading.install = false;
    dialog.hideLoader();
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
  } else if (!result.canceled) {
    [installLocalPluginDialog.value.filepath] = result.filePaths;
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
const refreshDevPlugins = async () => {
  if (loading.refresh) {
    return;
  }
  loading.refresh = true;
  try {
    await ipc.invoke(ipcType.REFRESH_DEV_PLUGINS);
  } catch (err) {
    alert.show(err.message, 'error');
  } finally {
    loading.refresh = false;
    getPlugins();
  }
};

const pluginCardRefs = ref([]);
const devPluginWizardRef = ref(null);

const openPluginSettingPanel = async () => {
  const query = { ...route.query };
  const settingPluginId = query.setting;
  if (settingPluginId && pluginCardRefs.value && pluginCardRefs.value.length) {
    // settingMenu 在插件激活时才由主进程合并进插件对象，渲染端 store 可能
    // 还停留在激活前的快照；先刷新一次插件数据，避免配置面板渲染为空
    await getPlugins();
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
let firstActivation = true;
onActivated(() => {
  // 首次激活早于 App.vue 发送 main-renderer-ready，此时主进程插件加载器未就绪，
  // 触发 GET_PLUGINS 会得到「插件未初始化」错误；启动拉取交给 App.vue，这里只管后续切回页面时刷新
  if (firstActivation) {
    firstActivation = false;
  } else {
    getPlugins();
  }
  openPluginSettingPanel();
  installPluginConfirm();
});
</script>

<style scoped>
.center-search {
  flex: 1 1 auto;
  min-width: 0;
}

.search-item-description {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-item-meta {
  display: block;
  font-size: .875rem;
  opacity: .8;
}

.search-version-select {
  width: 128px;
}
</style>
