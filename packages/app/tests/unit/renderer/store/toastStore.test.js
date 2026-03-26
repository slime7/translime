import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import useToastStore from '@/store/toastStore';

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

describe('toastStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('初始状态', () => {
    it('应该有正确的默认值', () => {
      const store = useToastStore();

      expect(store.msg).toBe('');
      expect(store.visible).toBe(false);
      expect(store.timeout).toBe(6000);
      expect(store.timer).toBe(null);
    });
  });

  describe('show', () => {
    it('应该显示 toast 并设置消息', () => {
      const store = useToastStore();

      store.show({ msg: '测试消息', timeout: 3000 });

      expect(store.visible).toBe(true);
      expect(store.msg).toBe('测试消息');
      expect(store.timeout).toBe(3000);
    });

    it('应该在超时后自动隐藏', () => {
      const store = useToastStore();

      store.show({ msg: '测试', timeout: 3000 });
      expect(store.visible).toBe(true);

      vi.advanceTimersByTime(2999);
      expect(store.visible).toBe(true);

      vi.advanceTimersByTime(1);

      expect(store.visible).toBe(false);
    });

    it('未传 timeout 时应该使用默认值 6000ms', () => {
      const store = useToastStore();

      store.show({ msg: '默认超时' });

      vi.advanceTimersByTime(5999);
      expect(store.visible).toBe(true);

      vi.advanceTimersByTime(1);
      expect(store.visible).toBe(false);
    });

    it('连续调用时应该清除之前的 timer', () => {
      const store = useToastStore();
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      store.show({ msg: '第一条', timeout: 3000 });
      store.show({ msg: '第二条', timeout: 3000 });

      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(store.msg).toBe('第二条');
    });

    it('连续调用时应该先隐藏再显示', () => {
      const store = useToastStore();

      store.show({ msg: '第一条', timeout: 3000 });
      expect(store.visible).toBe(true);

      // 模拟在显示状态下再次调用
      store.show({ msg: '第二条', timeout: 3000 });

      // 最终应该显示第二条
      expect(store.msg).toBe('第二条');
      expect(store.visible).toBe(true);
    });
  });
});
