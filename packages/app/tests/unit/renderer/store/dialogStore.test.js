import {
  beforeEach, describe, expect, it,
  vi,
} from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import useDialogStore from '@/store/dialogStore';

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

describe('dialogStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('初始状态', () => {
    it('应该有正确的默认值', () => {
      const store = useDialogStore();

      expect(store.dialogs).toEqual([]);
      expect(store.titleClass).toBe('headline');
      expect(store.loader).toBe(false);
      expect(store.confirm.visible).toBe(false);
    });
  });

  describe('append', () => {
    it('应该正确添加对话框', () => {
      const store = useDialogStore();

      store.append({
        title: '测试标题',
        content: '测试内容',
      });

      expect(store.dialogs).toHaveLength(1);
      expect(store.dialogs[0].title).toBe('测试标题');
      expect(store.dialogs[0].content).toBe('测试内容');
      expect(store.dialogs[0].attr.value).toBe(true);
    });

    it('应该使用默认标题', () => {
      const store = useDialogStore();

      store.append({ content: '只有内容' });

      expect(store.dialogs[0].title).toBe('提示');
    });

    it('应该合并自定义属性', () => {
      const store = useDialogStore();

      store.append({
        content: '测试',
        attr: { maxWidth: 500, custom: 'value' },
      });

      expect(store.dialogs[0].attr.maxWidth).toBe(500);
      expect(store.dialogs[0].attr.custom).toBe('value');
    });

    it('应该能添加多个对话框', () => {
      const store = useDialogStore();

      store.append({ content: '对话框 1' });
      store.append({ content: '对话框 2' });

      expect(store.dialogs).toHaveLength(2);
    });
  });

  describe('pop', () => {
    it('应该移除最后一个对话框', () => {
      const store = useDialogStore();
      store.append({ content: '对话框 1' });
      store.append({ content: '对话框 2' });

      store.pop();

      expect(store.dialogs).toHaveLength(1);
      expect(store.dialogs[0].content).toBe('对话框 1');
    });

    it('空列表时调用 pop 不应该报错', () => {
      const store = useDialogStore();

      expect(() => store.pop()).not.toThrow();
    });
  });

  describe('showConfirm', () => {
    it('应该显示确认对话框并返回 Promise', () => {
      const store = useDialogStore();

      const promise = store.showConfirm({
        title: '确认标题',
        content: '确认内容',
      });

      expect(store.confirm.visible).toBe(true);
      expect(store.confirm.title).toBe('确认标题');
      expect(store.confirm.content).toBe('确认内容');
      expect(promise).toBeInstanceOf(Promise);
    });

    it('应该使用默认标题', () => {
      const store = useDialogStore();

      store.showConfirm({ content: '只有内容' });

      expect(store.confirm.title).toBe('提示');
    });
  });

  describe('clearConfirm', () => {
    it('应该清除确认对话框状态', () => {
      const store = useDialogStore();
      store.showConfirm({ title: '测试', content: '内容' });

      store.clearConfirm();

      expect(store.confirm.visible).toBe(false);
      expect(store.confirm.title).toBe('');
      expect(store.confirm.content).toBe('');
    });
  });
});
