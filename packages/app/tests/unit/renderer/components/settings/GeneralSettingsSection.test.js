import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { mount } from '@vue/test-utils';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import GeneralSettingsSection from '@/components/settings/GeneralSettingsSection.vue';

const {
  appConfigStoreMock, storeMock, mockIpc, mockToast,
} = vi.hoisted(() => ({
  storeMock: {
    appSetting: {
      openAtLogin: false,
      minimizeToTrayOnClose: true,
      showDevPlugin: false,
    },
    setAppOpenAtLogin: vi.fn(),
    setAppMinimizeToTrayOnClose: vi.fn(),
    setShowDevPlugin: vi.fn(),
  },
  appConfigStoreMock: {
    set: vi.fn(),
  },
  mockIpc: {
    send: vi.fn(),
    invoke: vi.fn(),
  },
  mockToast: {
    show: vi.fn(),
  },
}));

vi.mock('@/store/globalStore', () => ({
  default: () => storeMock,
}));

vi.mock('@/utils', () => ({
  appConfigStore: appConfigStoreMock,
}));

vi.mock('@/hooks/electron', () => ({
  useIpc: () => mockIpc,
}));

vi.mock('@/hooks/useToast', () => ({
  default: () => mockToast,
}));

const globalMountOptions = {
  global: {
    stubs: {
      'mat-list': { template: '<div><slot /></div>' },
      'mat-list-item': {
        template: '<button class="setting-item" @click="$emit(\'click\')"><slot /><slot name="trailing" /></button>',
      },
      'mat-switch': {
        template: '<div class="switch" />',
        props: ['modelValue'],
      },
    },
  },
};

describe('GeneralSettingsSection.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electron = {
      platform: 'win32',
    };
  });

  it('在非 Linux 平台下不显示添加到桌面和开始菜单按钮', () => {
    window.electron = {
      platform: 'win32',
    };

    const wrapper = mount(GeneralSettingsSection, globalMountOptions);

    expect(wrapper.find('[data-test="setting-linux-shortcuts"]').exists()).toBe(false);
  });

  it('在 Linux 平台下显示按钮并能够触发创建快捷方式与提示', async () => {
    window.electron = {
      platform: 'linux',
    };
    mockIpc.invoke.mockResolvedValueOnce({ success: true });

    const wrapper = mount(GeneralSettingsSection, globalMountOptions);
    const shortcutButton = wrapper.find('[data-test="setting-linux-shortcuts"]');

    expect(shortcutButton.exists()).toBe(true);
    expect(shortcutButton.text()).toContain('添加到桌面和开始菜单');

    await shortcutButton.trigger('click');

    expect(mockIpc.invoke).toHaveBeenCalledWith(ipcType.CREATE_LINUX_SHORTCUTS);
    expect(mockToast.show).toHaveBeenCalledWith('已添加到桌面和开始菜单');
  });

  it('在快捷方式创建失败时通过 toast 提示错误原因', async () => {
    window.electron = {
      platform: 'linux',
    };
    mockIpc.invoke.mockResolvedValueOnce({ success: false, error: '权限不足' });

    const wrapper = mount(GeneralSettingsSection, globalMountOptions);
    const shortcutButton = wrapper.find('[data-test="setting-linux-shortcuts"]');

    await shortcutButton.trigger('click');

    expect(mockToast.show).toHaveBeenCalledWith('权限不足');
  });
});
