import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import useToast from '@/hooks/useToast';

// Mock electron hooks to avoid window.electron undefined error
vi.mock('@/hooks/electron', () => ({
  useIpc: () => ({
    send: vi.fn(),
    invoke: vi.fn(),
    on: vi.fn(),
  }),
  useDialog: () => ({
    showOpenDialog: vi.fn(),
  }),
}));

describe('useToast', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  it('应该返回所需的方法和属性', () => {
    const toast = useToast();

    expect(toast).toHaveProperty('show');
    expect(toast).toHaveProperty('setVisibleState');
    expect(toast).toHaveProperty('visible');
    expect(toast).toHaveProperty('msg');
  });

  describe('show', () => {
    it('应该显示 toast 消息', () => {
      const toast = useToast();

      toast.show('测试消息');

      expect(toast.visible.value).toBe(true);
      expect(toast.msg.value).toBe('测试消息');
    });

    it('应该支持自定义超时时间', () => {
      const toast = useToast();

      toast.show('测试', 3000);

      expect(toast.visible.value).toBe(true);
    });
  });

  describe('setVisibleState', () => {
    it('应该手动设置可见状态', () => {
      const toast = useToast();
      toast.show('测试');

      toast.setVisibleState(false);

      expect(toast.visible.value).toBe(false);
    });
  });

  describe('visible ref', () => {
    it('应该是响应式的', () => {
      const toast = useToast();

      expect(toast.visible.value).toBe(false);

      toast.show('测试');

      expect(toast.visible.value).toBe(true);
    });
  });

  describe('msg ref', () => {
    it('应该反映当前消息', () => {
      const toast = useToast();

      toast.show('消息 A');
      expect(toast.msg.value).toBe('消息 A');

      toast.show('消息 B');
      expect(toast.msg.value).toBe('消息 B');
    });
  });
});
