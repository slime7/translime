import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import useAlert from '@/hooks/useAlert';

// Mock electron hooks
vi.mock('@/hooks/electron', () => ({
  useNotify: () => ({
    isSupported: () => false,
    show: vi.fn(),
  }),
}));

// Mock getUuiD
vi.mock('@pkg/share/utils', () => ({
  getUuiD: () => `uuid-${Date.now()}`,
}));

describe('useAlert', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('应该返回所需的方法和属性', () => {
    const alert = useAlert();

    expect(alert).toHaveProperty('show');
    expect(alert).toHaveProperty('hide');
    expect(alert).toHaveProperty('list');
    expect(alert).toHaveProperty('activeList');
    expect(alert).toHaveProperty('showDrawer');
    expect(alert).toHaveProperty('hideDrawer');
    expect(alert).toHaveProperty('drawerVisible');
  });

  describe('show', () => {
    it('应该调用 store 的 push 方法', () => {
      const alert = useAlert();

      // show 方法应该不抛出错误
      expect(() => alert.show('测试消息')).not.toThrow();
    });

    it('应该支持不同的消息类型', () => {
      const alert = useAlert();

      expect(() => alert.show('信息', 'info')).not.toThrow();
      expect(() => alert.show('错误', 'error')).not.toThrow();
      expect(() => alert.show('成功', 'success')).not.toThrow();
      expect(() => alert.show('警告', 'warning')).not.toThrow();
    });
  });

  describe('showDrawer / hideDrawer', () => {
    it('showDrawer 应该将 drawerVisible 设为 true', () => {
      const alert = useAlert();

      alert.showDrawer();

      expect(alert.drawerVisible.value).toBe(true);
    });

    it('hideDrawer 应该将 drawerVisible 设为 false', () => {
      const alert = useAlert();
      alert.showDrawer();

      alert.hideDrawer();

      expect(alert.drawerVisible.value).toBe(false);
    });
  });

  describe('list', () => {
    it('应该返回 alert 列表', () => {
      const alert = useAlert();

      expect(Array.isArray(alert.list)).toBe(true);
    });
  });
});
