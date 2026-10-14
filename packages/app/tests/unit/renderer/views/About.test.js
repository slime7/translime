import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import About from '@/views/About.vue';
import useUpdateStore from '@/store/updateStore';

const { ipcMock } = vi.hoisted(() => ({
  ipcMock: {
    invoke: vi.fn(async () => ({})),
    send: vi.fn(),
    on: vi.fn(),
  },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/electron', () => ({
  useIpc: () => ipcMock,
}));

vi.mock('@/hooks/useAlert', () => ({
  default: () => ({ show: vi.fn() }),
}));

vi.mock('@/hooks/useDialog', () => ({
  default: () => ({ showConfirm: vi.fn() }),
}));

vi.mock('@/hooks/useToast', () => ({
  default: () => ({ show: vi.fn() }),
}));

const globalMountOptions = {
  global: {
    stubs: {
      'mat-container': { template: '<div><slot /></div>' },
      'mat-card': { template: '<div><slot name="headline" /><slot /></div>' },
      'mat-card-content': { template: '<div><slot /></div>' },
      'mat-icon': true,
      'mat-progress': true,
      'mat-btn': {
        template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        props: ['disabled', 'loading', 'color', 'variant', 'icon', 'label'],
      },
    },
  },
};

const mountAbout = async () => {
  setActivePinia(createPinia());
  const wrapper = mount(About, globalMountOptions);
  await flushPromises();
  return wrapper;
};

const findCheckUpdateBtn = (wrapper) => wrapper.find('[data-test="about-check-update-btn"]');

describe('About.vue 检查更新入口', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // 主进程 autoUpdate 在 dev 下直接跳过检查且不回传任何状态，
  // 保持按钮可点会变成点了没有反馈的死按钮。
  it('dev 环境下检查更新按钮禁用', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const wrapper = await mountAbout();
    const button = findCheckUpdateBtn(wrapper);

    expect(button.exists()).toBe(true);
    expect(button.attributes('disabled')).toBeDefined();
  });

  it('正式环境保留可用的检查更新按钮', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const wrapper = await mountAbout();
    const button = findCheckUpdateBtn(wrapper);

    expect(button.exists()).toBe(true);
    expect(button.attributes('disabled')).toBeUndefined();
  });

  // 防止的回归：更新状态迁移到全局 store 后，关于页必须继续展示新版本信息与下载入口
  it('检测到新版本时展示版本号并提供下载入口', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    setActivePinia(createPinia());
    const updateStore = useUpdateStore();
    updateStore.status = 'available';
    updateStore.info = { version: '1.2.0' };

    const wrapper = mount(About, globalMountOptions);
    await flushPromises();

    expect(wrapper.text()).toContain('发现新版本: v1.2.0');

    const downloadBtn = wrapper.find('[data-test="about-download-update-btn"]');
    expect(downloadBtn.exists()).toBe(true);

    await downloadBtn.trigger('click');
    expect(ipcMock.send).toHaveBeenCalledWith(ipcType.START_DOWNLOAD_UPDATE);
  });
});
