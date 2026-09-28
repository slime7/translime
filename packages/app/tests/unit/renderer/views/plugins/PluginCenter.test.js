import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import {
  defineComponent, h,
} from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import usePluginCenterSearch from '@/views/plugins/hooks/usePluginCenterSearch';

vi.mock('@/hooks/useAlert', () => ({
  default: () => ({
    show: vi.fn(),
    showDrawer: vi.fn(),
  }),
}));

vi.mock('@/hooks/useDialog', () => ({
  default: () => ({
    showLoader: vi.fn(),
    hideLoader: vi.fn(),
    showConfirm: vi.fn(async () => ({ confirm: false })),
  }),
}));

vi.mock('@/hooks/useHttp', () => ({
  default: () => ({
    get: vi.fn(async () => ({ objects: [] })),
  }),
}));

vi.mock('@/utils', () => ({
  appConfigStore: {
    get: vi.fn(async (key, fallback) => fallback),
    set: vi.fn(async () => undefined),
  },
}));

vi.mock('@/hooks/electron', () => ({
  useIpc: () => ({
    send: vi.fn(),
    invoke: vi.fn(),
    on: vi.fn(),
    detach: vi.fn(),
  }),
  useDialog: () => ({
    showOpenDialog: vi.fn(),
  }),
}));

// 纯渲染 harness：不含 mde-vue 组件，在 setup 中调用 composable，
// 通过模块级变量把控制权交给测试（test-utils 的 vm 代理读不到 expose）
let harnessCtrl = null;
const SearchHarness = defineComponent({
  name: 'SearchHarness',
  setup() {
    harnessCtrl = usePluginCenterSearch();
    return () => h('div', 'harness');
  },
});

const OtherPage = defineComponent({
  name: 'OtherPage',
  setup() {
    return () => h('div', 'other-page');
  },
});

// 挂载在路由环境下：清空搜索依赖 route.name 变化（真实应用中页面随路由切换被 keep-alive 缓存）
const mountHarness = async () => {
  harnessCtrl = null;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'PluginCenter', component: SearchHarness },
      { path: '/other', name: 'Other', component: OtherPage },
    ],
  });
  await router.push('/');
  await router.isReady();

  const App = defineComponent({
    name: 'App',
    setup() {
      return () => h(SearchHarness);
    },
  });

  const wrapper = mount(App, {
    global: {
      plugins: [router],
    },
  });
  await flushPromises();
  return { wrapper, router, ctrl: harnessCtrl };
};

describe('usePluginCenterSearch', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('切换页面再返回后应清空搜索文本', async () => {
    // 防止的回归：页面被 keep-alive 缓存，搜索文本在切走再切回后残留，
    // 用户会误以为搜索仍然生效（需求明确要求切换页面时清空搜索文本）
    const { wrapper, router, ctrl } = await mountHarness();

    ctrl.search.value = '静态';
    expect(ctrl.search.value).toBe('静态');

    // 切走页面再切回：路由变化触发清空
    await router.push('/other');
    await flushPromises();
    await router.push('/');
    await flushPromises();

    expect(ctrl.search.value).toBe('');
    wrapper.unmount();
  });

  it('回车搜索应切到搜索结果页签，且输入对已拉取结果做本地过滤', async () => {
    // 防止的回归：搜索结果页签内继续输入时结果不变，
    // 只有重新回车才生效，用户误以为搜索失效
    const { wrapper, ctrl } = await mountHarness();

    ctrl.searchAction();
    await flushPromises();
    expect(ctrl.activeTab.value).toBe('search');

    // 模拟市场结果已拉取完成
    ctrl.searchResult.list.push(
      {
        packageName: 'translime-plugin-static-server',
        title: 'static server',
        description: '静态文件服务器',
      },
      {
        packageName: 'translime-plugin-hdr-capture',
        title: 'hdr截图',
        description: 'HDR 截图',
      },
    );
    expect(ctrl.filteredSearchResults.value.length).toBe(2);

    ctrl.search.value = '静态';
    expect(ctrl.filteredSearchResults.value.map((item) => item.packageName))
      .toEqual(['translime-plugin-static-server']);

    ctrl.search.value = '';
    expect(ctrl.filteredSearchResults.value.length).toBe(2);
    wrapper.unmount();
  });

  it('本地即时过滤应按包名、标题与描述匹配', async () => {
    // 防止的回归：已安装页签的本地过滤漏掉包名或描述命中，
    // 导致用户输入正确关键词却看不到已安装插件
    const { wrapper, ctrl } = await mountHarness();
    const store = (await import('@/store/globalStore')).default();

    store.setPlugins([
      {
        packageName: 'translime-plugin-static-server',
        plugin: { title: 'Static Server', description: '静态文件服务器' },
        enabled: true,
      },
      {
        packageName: 'translime-plugin-hdr-capture',
        plugin: { title: 'hdr截图', description: 'HDR 截图' },
        enabled: true,
      },
    ]);

    expect(ctrl.installedPlugins.value.length).toBe(2);

    ctrl.search.value = 'static-server';
    expect(ctrl.installedPlugins.value.map((item) => item.packageName))
      .toEqual(['translime-plugin-static-server']);

    ctrl.search.value = 'hdr';
    expect(ctrl.installedPlugins.value.map((item) => item.packageName))
      .toEqual(['translime-plugin-hdr-capture']);

    ctrl.search.value = '不存在的插件';
    expect(ctrl.installedPlugins.value.length).toBe(0);
    wrapper.unmount();
  });

  it('切换页签应清空搜索文本与结果状态', async () => {
    // 防止的回归：在页签间切换后残留上次搜索的关键词与结果，
    // 已安装网格仍被旧关键词过滤，用户以为插件丢失
    const { wrapper, ctrl } = await mountHarness();

    ctrl.searchAction();
    await flushPromises();
    ctrl.searchResult.list.push({
      packageName: 'translime-plugin-static-server',
      title: 'static server',
      description: '',
    });
    ctrl.searchResult.total = 5;
    ctrl.search.value = 'static';
    expect(ctrl.search.value).toBe('static');

    // 切到已安装页签：文本与结果状态全部清空
    ctrl.switchToInstalled();
    expect(ctrl.activeTab.value).toBe('installed');
    expect(ctrl.search.value).toBe('');
    expect(ctrl.searchResult.list.length).toBe(0);
    expect(ctrl.searchResult.total).toBe(0);
    expect(ctrl.searched.value).toBe(false);

    // 再切回搜索结果页签：仍是干净状态
    ctrl.switchToSearch();
    expect(ctrl.activeTab.value).toBe('search');
    expect(ctrl.search.value).toBe('');
    expect(ctrl.searched.value).toBe(false);
    wrapper.unmount();
  });

  it('重复点击当前页签不应清掉已有结果', async () => {
    // 防止的回归：页签切换带状态重置后，重复点击当前页签会把已有结果清掉
    const { wrapper, ctrl } = await mountHarness();

    ctrl.switchToSearch();
    expect(ctrl.activeTab.value).toBe('search');

    ctrl.searchResult.list.push({
      packageName: 'translime-plugin-static-server',
      title: 'static server',
      description: '',
    });

    ctrl.switchToSearch();
    expect(ctrl.activeTab.value).toBe('search');
    expect(ctrl.searchResult.list.length).toBe(1);

    ctrl.switchToInstalled();
    ctrl.switchToInstalled();
    expect(ctrl.activeTab.value).toBe('installed');
    wrapper.unmount();
  });
});
