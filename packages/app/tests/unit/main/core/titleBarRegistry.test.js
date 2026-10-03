import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import titleBarRegistry from '@main/core/titleBarRegistry';

describe('titleBarRegistry', () => {
  beforeEach(() => {
    titleBarRegistry.removeAllListeners();
    Object.keys(titleBarRegistry.getSerializableActions()).forEach((packageName) => {
      titleBarRegistry.clearTitleBarActions(packageName);
    });
  });

  describe('声明序列化', () => {
    it('直按钮与下拉菜单序列化为可渲染描述，id 按路径生成', () => {
      const click = vi.fn();
      titleBarRegistry.setTitleBarActions('translime-plugin-a', [
        {
          label: '打开目录', icon: 'folder_open', iconOnly: true, click,
        },
        {
          label: '更多',
          icon: 'settings',
          submenu: [
            { label: '刷新', click },
            { type: 'separator' },
            { label: '重置', enabled: false, click },
          ],
        },
      ]);

      const items = titleBarRegistry.getSerializableActions()['translime-plugin-a'];
      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({
        id: '0',
        label: '打开目录',
        icon: 'folder_open',
        iconOnly: true,
      });
      expect(items[1].type).toBe('submenu');
      expect(items[1].children).toEqual([
        { id: '1-0', label: '刷新' },
        { type: 'separator' },
        { id: '1-2', label: '重置', enabled: false },
      ]);
    });

    it('visible:false 与缺少 click 函数的项被过滤，孤立分隔线被清理', () => {
      titleBarRegistry.setTitleBarActions('translime-plugin-a', [
        { label: '隐藏', visible: false, click: vi.fn() },
        { label: '无动作' },
        { type: 'separator' },
        { label: '保留', click: vi.fn() },
      ]);

      const items = titleBarRegistry.getSerializableActions()['translime-plugin-a'];
      expect(items).toEqual([{ id: '3', label: '保留' }]);
    });
  });

  describe('动作执行与清理', () => {
    it('runTitleBarAction 按 id 路径执行对应函数', () => {
      const clicked = vi.fn();
      titleBarRegistry.setTitleBarActions('translime-plugin-a', [
        { label: '目录', click: vi.fn() },
        { label: '菜单', submenu: [{ label: '动作', click: clicked }] },
      ]);

      expect(titleBarRegistry.runTitleBarAction('translime-plugin-a', '1-0')).toBe(true);
      expect(clicked).toHaveBeenCalledTimes(1);
      expect(titleBarRegistry.runTitleBarAction('translime-plugin-a', 'missing')).toBe(false);
      expect(titleBarRegistry.runTitleBarAction('translime-plugin-other', '0')).toBe(false);
    });

    it('清除插件后描述与动作一并失效（插件停用不留悬空按钮）', () => {
      const clicked = vi.fn();
      titleBarRegistry.setTitleBarActions('translime-plugin-a', [
        { label: '目录', click: clicked },
      ]);

      expect(titleBarRegistry.clearTitleBarActions('translime-plugin-a')).toBe(true);
      expect(titleBarRegistry.getSerializableActions()['translime-plugin-a']).toBeUndefined();
      expect(titleBarRegistry.runTitleBarAction('translime-plugin-a', '0')).toBe(false);
      expect(clicked).not.toHaveBeenCalled();
      expect(titleBarRegistry.clearTitleBarActions('translime-plugin-a')).toBe(false);
    });

    it('传入空数组等价于清除；非法包名返回 false', () => {
      titleBarRegistry.setTitleBarActions('translime-plugin-a', [
        { label: '目录', click: vi.fn() },
      ]);
      expect(titleBarRegistry.setTitleBarActions('translime-plugin-a', [])).toBe(true);
      expect(titleBarRegistry.getSerializableActions()['translime-plugin-a']).toBeUndefined();
      expect(titleBarRegistry.setTitleBarActions('', [{ label: 'x', click: vi.fn() }])).toBe(false);
    });
  });

  describe('变更推送', () => {
    it('设置与清除都发出携带全量描述的 change 事件', () => {
      const listener = vi.fn();
      titleBarRegistry.on('change', listener);

      titleBarRegistry.setTitleBarActions('translime-plugin-a', [
        { label: '目录', click: vi.fn() },
      ]);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]['translime-plugin-a']).toHaveLength(1);

      titleBarRegistry.clearTitleBarActions('translime-plugin-a');
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener.mock.calls[1][0]['translime-plugin-a']).toBeUndefined();
    });
  });
});
