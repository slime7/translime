import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import useAlertStore from '@/store/alertStore';

// Mock electron hooks
vi.mock('@/hooks/electron', () => ({
  useNotify: () => ({
    isSupported: () => false,
    show: vi.fn(),
  }),
}));

// Mock getUuiD
vi.mock('@pkg/share/utils', () => ({
  getUuiD: () => 'test-uuid-123',
}));

describe('alertStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  describe('初始状态', () => {
    it('应该有正确的默认值', () => {
      const store = useAlertStore();

      expect(store.contents).toEqual([]);
      expect(store.drawerVisible).toBe(false);
    });
  });

  describe('pushContent', () => {
    it('应该正确添加 alert 内容', () => {
      const store = useAlertStore();

      store.pushContent({
        uuid: 'test-1',
        msg: '测试消息',
        type: 'info',
      });

      expect(store.contents).toHaveLength(1);
      expect(store.contents[0].msg).toBe('测试消息');
      expect(store.contents[0].type).toBe('info');
      expect(store.contents[0].uuid).toBe('test-1');
    });

    it('超过 300 条时应该移除最旧的', () => {
      const store = useAlertStore();

      // 添加 301 条
      for (let i = 0; i < 301; i += 1) {
        store.pushContent({
          uuid: `uuid-${i}`,
          msg: `消息 ${i}`,
        });
      }

      expect(store.contents).toHaveLength(300);
      // 第一条应该是 uuid-1（uuid-0 被移除了）
      expect(store.contents[0].uuid).toBe('uuid-1');
    });
  });

  describe('getAlertById getter', () => {
    it('应该按 uuid 查找 alert', () => {
      const store = useAlertStore();
      store.pushContent({ uuid: 'find-me', msg: '找到我' });
      store.pushContent({ uuid: 'other', msg: '其他' });

      const alert = store.getAlertById('find-me');

      expect(alert).toBeDefined();
      expect(alert.msg).toBe('找到我');
    });

    it('找不到时应该返回 undefined', () => {
      const store = useAlertStore();

      const alert = store.getAlertById('non-existent');

      expect(alert).toBeUndefined();
    });
  });

  describe('activeAlerts getter', () => {
    it('应该只返回 visible 为 true 的 alert', () => {
      const store = useAlertStore();
      store.pushContent({ uuid: '1', msg: 'visible', visible: true });
      store.pushContent({ uuid: '2', msg: 'hidden', visible: false });
      store.pushContent({ uuid: '3', msg: 'visible2', visible: true });

      const active = store.activeAlerts;

      expect(active).toHaveLength(2);
      expect(active.every((a) => a.visible)).toBe(true);
    });
  });

  describe('dismiss', () => {
    it('应该将 alert 的 visible 设为 false', () => {
      const store = useAlertStore();
      store.pushContent({ uuid: 'dismiss-me', msg: '将被关闭', visible: true });

      store.dismiss({ uuid: 'dismiss-me' });

      expect(store.getAlertById('dismiss-me').visible).toBe(false);
    });

    it('应该清除 timer', () => {
      const store = useAlertStore();
      const timer = setTimeout(() => {}, 1000);
      store.pushContent({ uuid: 'with-timer', msg: '有计时器', timer });

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      store.dismiss({ uuid: 'with-timer' });

      expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
    });
  });

  describe('setDrawerVisible', () => {
    it('应该正确设置 drawer 可见性', () => {
      const store = useAlertStore();

      store.setDrawerVisible(true);
      expect(store.drawerVisible).toBe(true);

      store.setDrawerVisible(false);
      expect(store.drawerVisible).toBe(false);
    });
  });
});
