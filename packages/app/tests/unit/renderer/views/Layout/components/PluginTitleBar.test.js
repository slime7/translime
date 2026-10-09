import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { mount } from '@vue/test-utils';
import PluginTitleBar from '@/views/Layout/components/PluginTitleBar.vue';

const { invokeMock, openPluginMenuMock, useGlobalStoreMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async () => true),
  openPluginMenuMock: vi.fn(),
  useGlobalStoreMock: vi.fn(),
}));

vi.mock('@/hooks/electron', () => ({
  useIpc: () => ({
    invoke: invokeMock,
  }),
}));

vi.mock('@/store/menuStore', () => ({
  default: () => ({
    openPluginMenu: openPluginMenuMock,
  }),
}));

vi.mock('@/store/globalStore', () => ({
  default: (...args) => useGlobalStoreMock(...args),
}));

const globalStubs = {
  global: {
    stubs: {
      'mat-btn': {
        template: '<button class="mat-btn-stub" @click="$emit(\'click\')"><slot /></button>',
        props: ['prefix', 'suffix', 'icon'],
      },
      'mat-tooltip': {
        template: '<span class="mat-tooltip-stub"><slot name="activator" /></span>',
      },
      'mat-menu': {
        template: '<div class="mat-menu-stub"><slot /></div>',
        props: ['modelValue', 'anchor'],
      },
      'mat-icon': true,
      'mat-divider': true,
    },
  },
};

const pluginWithActions = {
  packageName: 'translime-plugin-a',
  title: 'Plugin A',
  titleBarItems: [
    {
      id: '0', label: '打开备份目录', icon: 'folder_open', iconOnly: true,
    },
  ],
};

const mountTitleBar = (showDevPlugin, plugin) => {
  useGlobalStoreMock.mockReturnValue({ appSetting: { showDevPlugin } });
  return mount(PluginTitleBar, {
    props: { plugin },
    ...globalStubs,
  });
};

describe('PluginTitleBar.vue', () => {
  beforeEach(() => {
    invokeMock.mockClear();
    openPluginMenuMock.mockClear();
    useGlobalStoreMock.mockReset();
  });

  it('开发模式关闭时保留插件顶栏按钮区，且不渲染 Inspect（防止按钮区被 dev 开关误隐藏）', () => {
    const wrapper = mountTitleBar(false, pluginWithActions);

    const actions = wrapper.find('[data-test="plugin-title-bar-actions"]');
    expect(actions.exists()).toBe(true);
    expect(actions.find('button').attributes('aria-label')).toBe('打开备份目录');

    const inspectButtons = wrapper.findAll('button').filter((btn) => btn.text().includes('Inspect'));
    expect(inspectButtons).toHaveLength(0);
  });

  it('开发模式开启时在按钮区旁渲染 Inspect 按钮', () => {
    const wrapper = mountTitleBar(true, pluginWithActions);

    const inspectButtons = wrapper.findAll('button').filter((btn) => btn.text().includes('Inspect'));
    expect(inspectButtons).toHaveLength(1);
    expect(wrapper.find('[data-test="plugin-title-bar-actions"]').exists()).toBe(true);
  });

  it('点击标题按钮按插件包名打开插件菜单', async () => {
    const wrapper = mountTitleBar(false, pluginWithActions);

    const titleButton = wrapper.find('#plugin-title-menu-translime-plugin-a');
    expect(titleButton.exists()).toBe(true);
    await titleButton.trigger('click');

    expect(openPluginMenuMock).toHaveBeenCalledWith(
      'translime-plugin-a',
      expect.objectContaining({ type: 'click' }),
    );
  });
});
