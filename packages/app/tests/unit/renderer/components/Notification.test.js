import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import Notification from '@/views/Layout/components/Notification.vue';
import useAlertStore from '@/store/alertStore';

vi.mock('@/hooks/electron', () => ({
  useNotify: () => ({
    isSupported: () => false,
    show: vi.fn(),
  }),
}));

vi.mock('@pkg/share/utils', () => ({
  getUuiD: () => 'test-uuid',
}));

const globalStubs = {
  global: {
    directives: {
      scroll: {
        mounted() {},
      },
    },
    stubs: {
      'v-navigation-drawer': {
        template: '<div class="drawer-stub"><slot /></div>',
        props: ['modelValue'],
      },
      'v-alert': {
        template: '<div class="alert-stub"><slot /></div>',
      },
      'v-spacer': true,
    },
  },
};

const setScrollMetrics = (element, {
  clientHeight = 200,
  scrollHeight = 600,
  scrollTop = 0,
} = {}) => {
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: clientHeight,
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  });
  element.scrollTop = scrollTop;
};

describe('Notification.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('打开抽屉时应该滚动到底部', async () => {
    const store = useAlertStore();
    store.pushContent({ uuid: '1', msg: '第一条消息' });

    const wrapper = mount(Notification, globalStubs);
    const container = wrapper.find('.notify-container').element;
    setScrollMetrics(container);

    store.setDrawerVisible(true);
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(container.scrollTop).toBe(600);
  });

  it('用户停留在底部时，新消息进入后应该继续跟随到底部', async () => {
    const store = useAlertStore();
    store.pushContent({ uuid: '1', msg: '第一条消息' });

    const wrapper = mount(Notification, globalStubs);
    const container = wrapper.find('.notify-container').element;
    setScrollMetrics(container);

    store.setDrawerVisible(true);
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      value: 860,
    });
    store.pushContent({ uuid: '2', msg: '第二条消息' });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(container.scrollTop).toBe(860);
  });

  it('用户离开底部时，新消息进入后不应该强制跳到底部', async () => {
    const store = useAlertStore();
    store.pushContent({ uuid: '1', msg: '第一条消息' });

    const wrapper = mount(Notification, globalStubs);
    const container = wrapper.find('.notify-container').element;
    setScrollMetrics(container, {
      scrollTop: 50,
    });

    wrapper.vm.onAlertContainerScroll({
      target: container,
    });
    store.setDrawerVisible(true);
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      value: 860,
    });
    store.pushContent({ uuid: '2', msg: '第二条消息' });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(container.scrollTop).toBe(50);
  });
});
