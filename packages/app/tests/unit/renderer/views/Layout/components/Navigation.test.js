import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import Navigation from '@/views/Layout/components/Navigation.vue';
import NaviLink from '@/views/Layout/components/NaviLink.vue';
import useUpdateStore from '@/store/updateStore';

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
}));

vi.mock('@/hooks/useAlert', () => ({
  default: () => ({ show: vi.fn(), showDrawer: vi.fn() }),
}));

const NaviLinkStub = {
  name: 'NaviLink',
  props: ['to', 'open', 'icon', 'image', 'tooltip', 'isDev', 'dot', 'dataTest'],
  template: '<a :data-test="dataTest" />',
};

const MatBadgeStub = {
  name: 'MatBadge',
  props: ['content', 'dot', 'location', 'offset', 'color'],
  template: '<span><slot /></span>',
};

const mountNavigation = () => mount(Navigation, {
  global: {
    stubs: {
      NaviLink: NaviLinkStub,
      'mat-tooltip': { template: '<span><slot name="activator" /></span>' },
      'mat-divider': true,
      'mat-icon': true,
    },
  },
});

const mountNaviLink = (props) => mount(NaviLink, {
  props,
  global: {
    stubs: {
      'router-link': { props: ['to'], template: '<span><slot /></span>' },
      'mat-tooltip': { template: '<span><slot name="activator" /></span>' },
      'mat-badge': MatBadgeStub,
      'mat-icon': true,
    },
    directives: {
      navi: {},
    },
  },
});

const findLinkByTest = (wrapper, dataTest) => wrapper
  .findAllComponents(NaviLinkStub)
  .find((link) => link.props('dataTest') === dataTest);

describe('Navigation 关于入口角标', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  // 防止的回归：检测到新版本后关于入口必须出现点型角标，否则用户无从感知可更新
  it('检测到新版本时关于入口携带角标状态', () => {
    const updateStore = useUpdateStore();
    updateStore.status = 'available';

    const wrapper = mountNavigation();

    expect(findLinkByTest(wrapper, 'nav-about').props('dot')).toBe(true);
  });

  it('无新版本时关于入口不携带角标状态', () => {
    const updateStore = useUpdateStore();
    updateStore.status = 'not-available';

    const wrapper = mountNavigation();

    expect(findLinkByTest(wrapper, 'nav-about').props('dot')).toBe(false);
  });
});

describe('NaviLink 角标展示', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('dot 为真时渲染点型角标', () => {
    const wrapper = mountNaviLink({ to: { name: 'About' }, dot: true });

    const badge = wrapper.findComponent(MatBadgeStub);
    expect(badge.exists()).toBe(true);
    expect(badge.props('dot')).toBe(true);
    expect(badge.props('content')).toBeUndefined();
  });

  // 防止的回归：角标能力合并进 mat-badge 后，插件入口的 dev 标识不能丢失
  it('isDev 时保留 dev 标识徽标', () => {
    const wrapper = mountNaviLink({ to: { name: 'PluginPage' }, isDev: true });

    const badge = wrapper.findComponent(MatBadgeStub);
    expect(badge.exists()).toBe(true);
    expect(badge.props('content')).toBe('D');
    expect(badge.props('location')).toBe('bottom-end');
  });

  it('既非 dev 也无角标时不渲染徽标容器', () => {
    const wrapper = mountNaviLink({ to: { name: 'About' } });

    expect(wrapper.findComponent(MatBadgeStub).exists()).toBe(false);
  });
});
