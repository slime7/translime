import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import useMenuStore from '@/store/menuStore';

const { mockIpc, mockAlertShow } = vi.hoisted(() => ({
  mockIpc: {
    send: vi.fn(),
    invoke: vi.fn(),
    on: vi.fn(),
    detach: vi.fn(),
  },
  mockAlertShow: vi.fn(),
}));

vi.mock('@/hooks/electron', () => ({
  useIpc: () => mockIpc,
}));

vi.mock('@/hooks/useAlert', () => ({
  default: () => ({ show: mockAlertShow }),
}));

describe('menuStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe('openPluginMenu', () => {
    it('应该按插件包名请求菜单描述并打开菜单', async () => {
      const store = useMenuStore();
      mockIpc.invoke.mockResolvedValue({
        menuId: 'host-menu-1',
        items: [{ id: 'uninstall-plugin', label: '卸载插件' }],
      });

      await store.openPluginMenu('translime-plugin-demo');

      expect(mockIpc.invoke).toHaveBeenCalledWith(
        'open-plugin-context-menu',
        'translime-plugin-demo',
      );
      expect(store.open).toBe(true);
      expect(store.menuId).toBe('host-menu-1');
      expect(store.items).toEqual([{ id: 'uninstall-plugin', label: '卸载插件' }]);
    });

    it('触发元素带 id 时应把元素 id 作为锚点，否则使用指针坐标', async () => {
      const store = useMenuStore();
      mockIpc.invoke.mockResolvedValue({ menuId: 'm', items: [{ id: 'a', label: 'A' }] });

      await store.openPluginMenu('p', { currentTarget: { id: 'plugin-card-menu-p' } });
      expect(store.anchor).toBe('plugin-card-menu-p');

      await store.openPluginMenu('p', { currentTarget: {}, clientX: 30, clientY: 48 });
      expect(store.anchor).toEqual([30, 48]);
    });

    it('请求失败时应提示错误且不打开菜单', async () => {
      const store = useMenuStore();
      mockIpc.invoke.mockRejectedValue(new Error('插件未初始化'));

      await store.openPluginMenu('translime-plugin-demo');

      expect(mockAlertShow).toHaveBeenCalledWith('插件未初始化', 'error');
      expect(store.open).toBe(false);
    });

    it('无可显示项目时应保持菜单关闭', async () => {
      const store = useMenuStore();
      mockIpc.invoke.mockResolvedValue({ menuId: 'm', items: [] });

      await store.openPluginMenu('translime-plugin-demo');

      expect(store.open).toBe(false);
    });
  });

  describe('openTextEditMenu', () => {
    it('应该携带选中文本请求描述，并记录指针坐标与焦点元素', async () => {
      const store = useMenuStore();
      mockIpc.invoke.mockResolvedValue({
        menuId: 'host-menu-2',
        items: [{ id: 'cut', label: '剪切', enabled: true }],
      });
      const originalGetSelection = window.getSelection;
      window.getSelection = vi.fn(() => ({ toString: () => 'selected' }));
      const input = document.createElement('input');

      try {
        await store.openTextEditMenu({ clientX: 12, clientY: 34, currentTarget: input });
      } finally {
        window.getSelection = originalGetSelection;
      }

      expect(mockIpc.invoke).toHaveBeenCalledWith(
        'show-text-edit-context',
        { selectedText: 'selected' },
      );
      expect(store.anchor).toEqual([12, 34]);
      expect(store.focusEl).toBe(input);
      expect(store.open).toBe(true);
    });
  });

  describe('select', () => {
    it('应该回传 menuId 与菜单项 id 并关闭菜单', async () => {
      const store = useMenuStore();
      mockIpc.invoke.mockResolvedValue({
        menuId: 'host-menu-3',
        items: [{ id: 'copy-plugin-link', label: '复制分享链接' }],
      });
      await store.openPluginMenu('translime-plugin-demo');

      store.select({ id: 'copy-plugin-link' });

      expect(mockIpc.send).toHaveBeenCalledWith('plugin-context-menu-action', {
        menuId: 'host-menu-3',
        itemId: 'copy-plugin-link',
      });
      expect(store.open).toBe(false);
    });

    it('存在焦点元素时应先归还焦点再回传动作', async () => {
      const store = useMenuStore();
      const focus = vi.fn();
      const input = { focus };

      mockIpc.invoke.mockResolvedValue({
        menuId: 'host-menu-4',
        items: [{ id: 'paste', label: '粘贴' }],
      });
      await store.openTextEditMenu({ clientX: 0, clientY: 0, currentTarget: input });

      store.select({ id: 'paste' });

      expect(focus).toHaveBeenCalled();
      expect(focus.mock.invocationCallOrder[0]).toBeLessThan(
        mockIpc.send.mock.invocationCallOrder[0],
      );
    });
  });
});
