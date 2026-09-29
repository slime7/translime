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

const { httpGetMock, httpUrls } = vi.hoisted(() => ({
  httpGetMock: vi.fn(async () => ({ objects: [], total: 0 })),
  httpUrls: [],
}));

vi.mock('@/hooks/useHttp', () => ({
  default: (url) => {
    httpUrls.push(String(url));
    return {
      get: httpGetMock,
    };
  },
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
    ctrl.switchToSearch();

    // 切走页面再切回：路由变化触发清空，并回到默认的已安装页签
    await router.push('/other');
    await flushPromises();
    await router.push('/');
    await flushPromises();

    expect(ctrl.search.value).toBe('');
    expect(ctrl.activeTab.value).toBe('installed');
    wrapper.unmount();
  });

  it('已安装页签回车不应切换页签或请求市场', async () => {
    // 防止的回归：回车搜索自动切到市场页签，用户被强制离开当前正在过滤的列表
    const { wrapper, ctrl } = await mountHarness();
    httpGetMock.mockClear();
    httpUrls.length = 0;

    ctrl.search.value = 'static';
    ctrl.searchAction();
    await flushPromises();

    expect(ctrl.activeTab.value).toBe('installed');
    expect(ctrl.searched.value).toBe(false);
    expect(httpGetMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('进入市场页签应自动列出全部插件，回车按关键词查询且不切换页签', async () => {
    // 防止的回归：市场页签空搜索不列出全部插件，或回车查询时跳走页签
    const { wrapper, ctrl } = await mountHarness();
    httpGetMock.mockClear();
    httpUrls.length = 0;

    ctrl.switchToSearch();
    await flushPromises();
    expect(ctrl.activeTab.value).toBe('search');
    expect(httpGetMock).toHaveBeenCalledTimes(1);
    // 空关键词请求：text 只有通用 keywords 过滤，列出市场全部插件
    expect(httpUrls[0]).toContain('text=keywords:');

    ctrl.search.value = 'static';
    ctrl.searchAction();
    await flushPromises();
    expect(ctrl.activeTab.value).toBe('search');
    expect(httpUrls[1]).toContain('text=translime-plugin-static+');
    wrapper.unmount();
  });

  it('市场页签内输入对已拉取结果做本地过滤', async () => {
    // 防止的回归：搜索结果页签内继续输入时结果不变，
    // 只有重新回车才生效，用户误以为搜索失效
    const { wrapper, ctrl } = await mountHarness();

    ctrl.switchToSearch();
    await flushPromises();
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

  it('市场页签退格删空文本应重新列出全部插件且不切换页签', async () => {
    // 防止的回归：市场页签清空文本后残留旧的关键词结果，或自动跳回已安装页签
    const { wrapper, ctrl } = await mountHarness();
    httpGetMock.mockClear();
    httpUrls.length = 0;

    ctrl.switchToSearch();
    await flushPromises();
    const callsAfterEnterTab = httpGetMock.mock.calls.length;

    ctrl.search.value = 'static';
    ctrl.searchAction();
    await flushPromises();
    ctrl.searchResult.list.push({
      packageName: 'translime-plugin-static-server',
      title: 'static server',
      description: '',
    });

    ctrl.search.value = '';
    await flushPromises();

    // 不切换页签；结果被清空并重新以空关键词拉取全部插件
    expect(ctrl.activeTab.value).toBe('search');
    expect(ctrl.searched.value).toBe(true);
    expect(ctrl.searchResult.list.length).toBe(0);
    expect(httpGetMock.mock.calls.length).toBeGreaterThan(callsAfterEnterTab);
    wrapper.unmount();
  });

  it('切换页签应清空搜索文本与结果，进入市场页签自动列出全部', async () => {
    // 防止的回归：在页签间切换后残留上次搜索的关键词与结果，
    // 已安装网格仍被旧关键词过滤，用户以为插件丢失
    const { wrapper, ctrl } = await mountHarness();
    httpGetMock.mockClear();
    httpUrls.length = 0;

    ctrl.search.value = 'static';
    ctrl.searchAction();
    ctrl.switchToSearch();
    expect(ctrl.activeTab.value).toBe('search');
    expect(ctrl.search.value).toBe('');
    await flushPromises();
    expect(httpGetMock).toHaveBeenCalled();
    expect(ctrl.searched.value).toBe(true);

    ctrl.searchResult.list.push({
      packageName: 'translime-plugin-static-server',
      title: 'static server',
      description: '',
    });
    ctrl.switchToInstalled();
    expect(ctrl.activeTab.value).toBe('installed');
    expect(ctrl.search.value).toBe('');
    expect(ctrl.searchResult.list.length).toBe(0);
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
