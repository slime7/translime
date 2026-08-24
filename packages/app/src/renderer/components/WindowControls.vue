<template>
  <div class="window-controls h-full">
    <div class="flex h-full">
      <div class="window-control-btn flex items-center justify-center" @click="appMinimize">
        <svg
          width="11"
          height="11"
          viewBox="0 0 11 11"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            :d="icon.minimize"
            fill="currentColor"
          />
        </svg>
      </div>

      <div class="window-control-btn flex items-center justify-center" v-if="isMaximize" @click="appUnmaximize">
        <svg
          width="11"
          height="11"
          viewBox="0 0 11 11"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            :d="icon.unmaximize"
            fill="currentColor"
          />
        </svg>
      </div>

      <div class="window-control-btn flex items-center justify-center" v-if="!isMaximize" @click="appMaximize">
        <svg
          width="11"
          height="11"
          viewBox="0 0 11 11"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            :d="icon.maximize"
            fill="currentColor"
          />
        </svg>
      </div>

      <div class="window-control-btn close flex items-center justify-center" @click="appClose">
        <svg
          width="11"
          height="11"
          viewBox="0 0 11 11"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            :d="icon.close"
            fill="currentColor"
          />
        </svg>
      </div>
    </div>
  </div>
</template>

<script>
import { toRefs } from 'vue';
import {
  APP_CLOSE,
  APP_MAXIMIZE,
  APP_MINIMIZE,
  APP_UNMAXIMIZE,
} from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';

export default {
  name: 'WindowControls',

  props: {
    isMaximize: {
      type: Boolean,
      default: false,
    },
    win: {
      default: 'app',
      type: String,
    },
  },

  emits: ['windowMinimize', 'windowUnmaximize', 'windowMaximize', 'windowClose'],

  setup(props, { emit }) {
    const ipc = useIpc();

    const { win } = toRefs(props);
    const icon = {
      minimize: 'M11 4.399V5.5H0V4.399h11z',
      unmaximize: 'M11 8.798H8.798V11H0V2.202h2.202V0H11v8.798zm-3.298-5.5h-6.6v6.6h6.6v-6.6zM9.9 1.1H3.298v1.101h5.5v5.5h1.1v-6.6z',
      maximize: 'M11 0v11H0V0h11zM9.899 1.101H1.1V9.9h8.8V1.1z',
      close: 'M6.279 5.5L11 10.221l-.779.779L5.5 6.279.779 11 0 10.221 4.721 5.5 0 .779.779 0 5.5 4.721 10.221 0 11 .779 6.279 5.5z',
    };

    const appMinimize = () => {
      ipc.invoke(APP_MINIMIZE, win.value);
      emit('windowMinimize');
    };
    const appUnmaximize = () => {
      ipc.invoke(APP_UNMAXIMIZE, win.value);
      emit('windowUnmaximize');
    };
    const appMaximize = () => {
      ipc.invoke(APP_MAXIMIZE, win.value);
      emit('windowMaximize');
    };
    const appClose = () => {
      ipc.invoke(APP_CLOSE, win.value);
      emit('windowClose');
    };

    return {
      icon,
      appMinimize,
      appUnmaximize,
      appMaximize,
      appClose,
    };
  },
};
</script>

<style scoped>
.window-control-btn {
  width: 40px;
  height: 24px;
  cursor: default;
  -webkit-app-region: no-drag;
}

.window-control-btn:hover {
  background-color: rgb(0 0 0 / 20%);
}

@media (prefers-color-scheme: dark) {
  .window-control-btn:hover {
    background-color: rgb(255 255 255 / 30%);
  }
}

.window-control-btn.close:hover {
  background-color: rgb(232 17 35 / 90%) !important;
}

.window-control-btn.close:hover path {
  fill: #fff;
}
</style>
*** Add File: packages/app/tests/unit/renderer/components/WindowControls.test.js
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
