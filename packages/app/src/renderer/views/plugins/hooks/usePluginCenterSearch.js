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

  const getPluginDetail = async (packageName) => {
    try {
      return await useHttp(`https://registry.npmjs.org/${packageName}`, {
        params: {
          x: Math.random(),
        },
      }).get();
    } catch (err) {
      alert.show(err.message, 'error');
    }
    return null;
  };

  const searchRequest = async (q = '', page = 0) => {
    if (searchLoading.value) {
      return;
    }
    searchLoading.value = true;
    try {
      const searchText = `text=${q ? `translime-plugin-${q}+` : ''}keywords:translime%20plugin`;
      // doc: https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md#get-v1search
      const data = await useHttp(`https://registry.npmjs.com/-/v1/search?${searchText}`, {
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

  const searchAction = () => {
    if (searchLoading.value) {
      return;
    }
    searched.value = true;
    activeTab.value = 'search';
    searchResult.list = [];
    searchRequest(search.value, 0);
  };

  const searchMore = () => {
    if (searchLoading.value) {
      return;
    }
    searchRequest(search.value, searchPage.value + 1);
  };

  const clearSearchResult = () => {
    search.value = '';
    searchResult.list = [];
    searchResult.total = 0;
    searchPage.value = 0;
    searched.value = false;
  };

  // 切换页签即离开当前搜索上下文：清空文本与结果，两个页签都从干净状态开始
  const resetSearchState = () => {
    clearSearchResult();
  };

  const switchToSearch = () => {
    if (activeTab.value === 'search') {
      return;
    }
    resetSearchState();
    activeTab.value = 'search';
  };

  const switchToInstalled = () => {
    if (activeTab.value === 'installed') {
      return;
    }
    resetSearchState();
    activeTab.value = 'installed';
  };

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
