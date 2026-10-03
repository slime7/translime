import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { mount } from '@vue/test-utils';
import PluginTitleBarActions from '@/views/Layout/components/PluginTitleBarActions.vue';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async () => true),
}));

vi.mock('@/hooks/electron', () => ({
  useIpc: () => ({
    invoke: invokeMock,
  }),
}));

const globalStubs = {
  global: {
    stubs: {
      'mat-btn': {
        template: '<button class="mat-btn-stub" @click="$emit(\'click\')"><slot /></button>',
      },
      'mat-tooltip': {
        template: '<span class="mat-tooltip-stub"><slot name="activator" /></span>',
      },
      'mat-menu': {
        template: '<div class="mat-menu-stub"><slot /></div>',
        props: ['modelValue', 'anchor'],
      },
      'mat-menu-item': {
        template: '<div class="mat-menu-item-stub" @click="$emit(\'click\')"><slot name="leading" /><slot /><slot name="submenu" /></div>',
        props: ['disabled', 'tooltip'],
      },
      'mat-icon': true,
      'mat-divider': true,
    },
  },
};

const iconOnlyItems = [
  {
    id: '0', label: '打开备份目录', icon: 'folder_open', iconOnly: true,
  },
  {
    id: '1', label: '同步设置', icon: 'cloud_sync', iconOnly: true,
  },
];

describe('PluginTitleBarActions.vue', () => {
  beforeEach(() => {
    invokeMock.mockClear();
  });

  it('无声明时不渲染按钮区（未注册顶栏按钮的插件保持原样）', () => {
    const wrapper = mount(PluginTitleBarActions, {
      props: { plugin: { packageName: 'translime-plugin-a' } },
      ...globalStubs,
    });

    expect(wrapper.find('[data-test="plugin-title-bar-actions"]').exists()).toBe(false);
  });

  it('渲染直按钮并携带 aria-label，点击回传插件名与动作 id', async () => {
    const wrapper = mount(PluginTitleBarActions, {
      props: { plugin: { packageName: 'translime-plugin-a', titleBarItems: iconOnlyItems } },
      ...globalStubs,
    });

    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].attributes('aria-label')).toBe('打开备份目录');

    await buttons[1].trigger('click');
    expect(invokeMock).toHaveBeenCalledWith('run-title-bar-action', {
      packageName: 'translime-plugin-a',
      id: '1',
    });
  });

  it('下拉菜单渲染子项，叶子点击回传子项 id（递归菜单组件需正确解析）', async () => {
    const wrapper = mount(PluginTitleBarActions, {
      props: {
        plugin: {
          packageName: 'translime-plugin-a',
          titleBarItems: [
            {
              id: '0',
              label: '更多',
              type: 'submenu',
              children: [{ id: '0-0', label: '刷新' }],
            },
          ],
        },
      },
      ...globalStubs,
    });

    // 子菜单描述默认渲染（mat-menu stub 不折叠），叶子项由递归组件解析
    const leaf = wrapper.find('.mat-menu-item-stub');
    expect(leaf.exists()).toBe(true);
    expect(wrapper.text()).toContain('刷新');

    await leaf.trigger('click');
    expect(invokeMock).toHaveBeenCalledWith('run-title-bar-action', {
      packageName: 'translime-plugin-a',
      id: '0-0',
    });
  });
});
