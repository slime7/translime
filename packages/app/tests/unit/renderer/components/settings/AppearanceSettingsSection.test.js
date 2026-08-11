import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { mount } from '@vue/test-utils';
import AppearanceSettingsSection from '@/components/settings/AppearanceSettingsSection.vue';

const { appConfigStoreMock, storeMock } = vi.hoisted(() => ({
  storeMock: {
    appSetting: {
      theme: 'system',
      themeColor: {
        name: 'custom',
        source: '#123456',
        variant: 'SchemeVibrant',
      },
    },
  },
  appConfigStoreMock: {
    set: vi.fn(),
  },
}));

vi.mock('@/store/globalStore', () => ({
  default: () => storeMock,
}));

vi.mock('@/utils', () => ({
  appConfigStore: appConfigStoreMock,
}));

const globalMountOptions = {
  global: {
    stubs: {
      MdeList: { template: '<div><slot /></div>' },
      MdeListItem: {
        template: '<button class="setting-item" @click="$emit(\'click\')">{{ title }}|{{ selected || "" }}</button>',
        props: ['title', 'selected', 'isActive', 'itemType'],
      },
      ThemeSelectDialog: {
        template: '<div class="theme-dialog">{{ modelValue }}</div>',
        props: ['modelValue'],
      },
      ThemeColorDialog: {
        template: '<div class="color-dialog">{{ modelValue }}</div>',
        props: ['modelValue'],
      },
    },
  },
};

describe('AppearanceSettingsSection.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMock.appSetting.theme = 'system';
    storeMock.appSetting.themeColor = {
      name: 'custom',
      source: '#123456',
      variant: 'SchemeVibrant',
    };
  });

  it('应该显示当前主题和颜色名称', () => {
    const wrapper = mount(AppearanceSettingsSection, globalMountOptions);

    expect(wrapper.text()).toContain('主题|系统');
    expect(wrapper.text()).toContain('颜色|#123456 - 高饱和度');
  });

  it('点击列表项应该打开对应对话框', async () => {
    const wrapper = mount(AppearanceSettingsSection, globalMountOptions);
    const buttons = wrapper.findAll('.setting-item');

    await buttons[0].trigger('click');
    await buttons[1].trigger('click');

    expect(wrapper.find('.theme-dialog').text()).toContain('true');
    expect(wrapper.find('.color-dialog').text()).toContain('true');
  });
});
