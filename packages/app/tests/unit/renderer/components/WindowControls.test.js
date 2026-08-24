import {
  describe, expect, it, vi,
} from 'vitest';
import { mount } from '@vue/test-utils';
import WindowControls from '@/components/WindowControls.vue';
import {
  APP_CLOSE,
  APP_MAXIMIZE,
  APP_MINIMIZE,
  APP_UNMAXIMIZE,
} from '@pkg/share/utils/ipcConstant';

// Mock dependencies
const mockInvoke = vi.fn();
vi.mock('@/hooks/electron', () => ({
  useIpc: () => ({
    invoke: mockInvoke,
  }),
}));

describe('WindowControls.vue', () => {
  it('应该渲染按钮', () => {
    const wrapper = mount(WindowControls);
    const buttons = wrapper.findAll('.window-control-btn');
    // Minimize, Maximize/Unmaximize, Close (3 buttons visible at a time)
    expect(buttons.length).toBe(3);
  });

  it('点击最小化应该触发 IPC 调用', async () => {
    const wrapper = mount(WindowControls);
    const btn = wrapper.findAll('.window-control-btn')[0]; // First is minimize
    await btn.trigger('click');

    expect(mockInvoke).toHaveBeenCalledWith(APP_MINIMIZE, 'app');
    expect(wrapper.emitted()).toHaveProperty('windowMinimize');
  });

  it('点击最大化应该触发 IPC 调用', async () => {
    const wrapper = mount(WindowControls, {
      props: { isMaximize: false },
    });
    // Check for maximize button (second button when not maximized)
    const btns = wrapper.findAll('.window-control-btn');
    const maximizeBtn = btns[1];

    await maximizeBtn.trigger('click');

    expect(mockInvoke).toHaveBeenCalledWith(APP_MAXIMIZE, 'app');
    expect(wrapper.emitted()).toHaveProperty('windowMaximize');
  });

  it('点击还原(Unmaximize)应该触发 IPC 调用', async () => {
    const wrapper = mount(WindowControls, {
      props: { isMaximize: true },
    });
    // Check for unmaximize button (second button when maximized)
    const btns = wrapper.findAll('.window-control-btn');
    const unmaximizeBtn = btns[1];

    await unmaximizeBtn.trigger('click');

    expect(mockInvoke).toHaveBeenCalledWith(APP_UNMAXIMIZE, 'app');
    expect(wrapper.emitted()).toHaveProperty('windowUnmaximize');
  });

  it('点击关闭应该触发 IPC 调用', async () => {
    const wrapper = mount(WindowControls);
    const closeBtn = wrapper.find('.window-control-btn.close');

    await closeBtn.trigger('click');

    expect(mockInvoke).toHaveBeenCalledWith(APP_CLOSE, 'app');
    expect(wrapper.emitted()).toHaveProperty('windowClose');
  });
});
