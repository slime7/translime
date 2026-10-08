import {
  computed, reactive, ref, watch,
} from 'vue';
import { useRoute } from 'vue-router';
import verCompare from 'semver-compare';
import useAlert from '@/hooks/useAlert';
import useHttp from '@/hooks/useHttp';
import useGlobalStore from '@/store/globalStore';

export const SEARCH_PAGE_SIZE = 8;

export const parseSearchResult = (item) => {
  const versions = Object.keys(item.versions).map((version) => ({
    value: version,
    title: `@${version}`,
  })).reverse();
  const latest = item.versions[item['dist-tags'].latest];

  return {
    packageName: latest.name,
    title: latest.plugin.title,
    description: latest.plugin.description,
    author: latest.author ? latest.author.name : latest.maintainers[0].name,
    icon: latest.plugin.icon ? `https://unpkg.com/${latest.name}@${latest.version}/${latest.plugin.icon}` : null,
    version: latest.version,
    enabled: false,
    searchResultItem: true,
    versions,
  };
};

/**
 * 插件中心的搜索与页签状态：市场搜索、本地即时过滤、已安装过滤与版本选择。
 * 不含 IPC 相关动作（安装/卸载/启停用等），它们留在页面组件中。
 */
export default function usePluginCenterSearch() {
  const store = useGlobalStore();
  const alert = useAlert();
  const route = useRoute();

  const searchLoading = ref(false);
  const search = ref('');
  const searched = ref(false);
  const searchResult = reactive({
    list: [],
    total: 0,
  });
  const searchPage = ref(0);
  const selectedVersions = reactive({});

  // 工具栏分页：installed=已安装插件，search=搜索结果
  const activeTab = ref('installed');

  const searchVisible = computed(() => searched.value || searchLoading.value);

  const filteredSearchResults = computed(() => {
    const query = search.value.toLowerCase().trim();

    if (!query) {
      return searchResult.list;
    }

    return searchResult.list.filter((item) => {
      const title = (item.title || '').toLowerCase();
      const description = (item.description || '').toLowerCase();
      return item.packageName.toLowerCase().includes(query)
        || title.includes(query)
        || description.includes(query);
    });
  });

  // 搜索框同时作为本地库存的即时过滤：本地结果优先，回车后再查市场
  const installedPlugins = computed(() => {
    const query = search.value.toLowerCase().trim();

    if (!query) {
      return store.plugins;
    }

    return store.plugins.filter((plugin) => {
      const title = (plugin.plugin?.title || plugin.title || plugin.packageName).toLowerCase();
      const description = (plugin.plugin?.description || plugin.description || '').toLowerCase();

      return plugin.packageName.toLowerCase().includes(query)
        || title.includes(query)
        || description.includes(query);
    });
  });

  const versionListFor = (item) => [
    {
      value: '',
      title: '@latest',
    },
    ...(item.versions ?? []),
  ];

  const withVersion = (item) => {
    const version = selectedVersions[item.packageName];
    return version ? `${item.packageName}@${version}` : item.packageName;
  };

  const isInstalled = (item) => store.plugins.some((p) => p.packageName === item.packageName);

  const canUpdated = (item) => {
    const installedPlugin = store.plugins.find((p) => p.packageName === item.packageName);
    return !!installedPlugin && verCompare(item.version, installedPlugin.version) > 0;
  };

  // 与安装流程使用同一个 registry 配置（setting.registry），避免搜索与安装来源不一致
  const getRegistryBase = () => {
    const registry = String(store.appSetting?.registry || '').replace(/\/+$/, '');
    return registry || 'https://registry.npmjs.org';
  };

  const getPluginDetail = async (packageName) => {
    const request = (registryBase) => useHttp(`${registryBase}/${packageName}`, {
      params: {
        x: Math.random(),
      },
    }).get();
    try {
      return await request(getRegistryBase());
    } catch (err) {
      // 配置的镜像源查询失败时回退 npm 官方源重试一次
      if (getRegistryBase() === 'https://registry.npmjs.org') {
        alert.show(err.message, 'error');
        return null;
      }
      try {
        return await request('https://registry.npmjs.org');
      } catch (fallbackErr) {
        alert.show(fallbackErr.message, 'error');
      }
    }
    return null;
  };

  const searchRequest = async (q = '', page = 0) => {
    if (searchLoading.value) {
      return;
    }
    searchLoading.value = true;
    try {
      // 搜索固定走 npm 官方源。官方源中 keywords: 限定词负责过滤（多关键词
      // + 为 AND、, 为 OR），普通搜索词只影响相关度排序：
      // https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md#get-v1search
      // 带连字符的 "translime-plugin-xxx" 排序词几乎无效，须拆成裸关键词
      const searchUrl = `https://registry.npmjs.org/-/v1/search?text=${q ? `${q}+` : ''}keywords:translime-plugin`;
      const data = await useHttp(searchUrl, {
        params: {
          size: SEARCH_PAGE_SIZE,
          from: page * SEARCH_PAGE_SIZE,
          x: Math.random(),
        },
      }).get();
      const filterData = data.objects.filter((item) => item.package.name.includes('translime-plugin'));
      const packages = await Promise.all(filterData.map((p) => getPluginDetail(p.package.name, p.package.version)));
      searchResult.list.push(...packages.map((item) => parseSearchResult(item)));
      searchResult.total = +data.total;
      searchPage.value = page;
    } catch (err) {
      alert.show(err.message, 'error');
    } finally {
      searchLoading.value = false;
    }
  };

  const clearSearchResult = () => {
    search.value = '';
    searchResult.list = [];
    searchResult.total = 0;
    searchPage.value = 0;
    searched.value = false;
  };

  // 市场页签的浏览模式：空关键词列出市场全部插件（分页加载）
  const loadMarketAll = () => {
    if (searchLoading.value) {
      return;
    }
    searched.value = true;
    searchResult.list = [];
    searchResult.total = 0;
    searchPage.value = 0;
    searchRequest('', 0);
  };

  // 回车提交：不切换页签，搜索只作用于当前页签——
  // 已安装页签的过滤是实时的，回车无需任何动作；
  // 市场页签按关键词查询，留空=列出市场全部插件
  const searchAction = () => {
    if (searchLoading.value || activeTab.value !== 'search') {
      return;
    }
    if (!search.value.trim()) {
      loadMarketAll();
      return;
    }
    searched.value = true;
    searchResult.list = [];
    searchRequest(search.value, 0);
  };

  const searchMore = () => {
    if (searchLoading.value) {
      return;
    }
    searchRequest(search.value, searchPage.value + 1);
  };

  // 切换页签即离开当前搜索上下文：清空文本与结果并回到默认页签，
  // 调用方随后按需切换到目标页签
  const resetSearchState = () => {
    clearSearchResult();
    activeTab.value = 'installed';
  };

  const switchToSearch = () => {
    if (activeTab.value === 'search') {
      return;
    }
    resetSearchState();
    activeTab.value = 'search';
    // 进入市场页签即以浏览模式列出全部插件
    loadMarketAll();
  };

  const switchToInstalled = () => {
    if (activeTab.value === 'installed') {
      return;
    }
    resetSearchState();
    activeTab.value = 'installed';
  };

  // 市场页签下文本被清空（退格/剪切/✕）时重新列出全部插件；
  // 已安装页签的清空由本地即时过滤自然恢复，无需处理。
  // 不切换页签：resetSearchState 会先把页签设回 installed，此监听不会误触发
  watch(search, (value) => {
    if (!value.trim() && activeTab.value === 'search') {
      loadMarketAll();
    }
  });

  // 路由切换（离开插件中心）同样完整重置：页面被 keep-alive 缓存（deactivated 钩子不可靠），
  // 用路由监听保证切走再切回后不残留旧关键词与旧结果
  watch(() => route.name, () => {
    resetSearchState();
  });

  return {
    search,
    searched,
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
    searchRequest,
    searchAction,
    searchMore,
    clearSearchResult,
    switchToSearch,
    switchToInstalled,
  };
}
