import {
  beforeEach, describe, expect, it,
  vi,
} from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import useDialog from '@/hooks/useDialog';

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

describe('useDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('应该返回所需的方法和属性', () => {
    const dialog = useDialog();

    expect(dialog).toHaveProperty('dialogs');
    expect(dialog).toHaveProperty('titleClass');
    expect(dialog).toHaveProperty('loader');
    expect(dialog).toHaveProperty('confirm');
    expect(dialog).toHaveProperty('showConfirm');
    expect(dialog).toHaveProperty('show');
    expect(dialog).toHaveProperty('pop');
    expect(dialog).toHaveProperty('showLoader');
    expect(dialog).toHaveProperty('hideLoader');
  });

  describe('show', () => {
    it('应该添加对话框到列表', () => {
      const dialog = useDialog();

      dialog.show('测试内容', '测试标题');

      expect(dialog.dialogs.value).toHaveLength(1);
      expect(dialog.dialogs.value[0].content).toBe('测试内容');
      expect(dialog.dialogs.value[0].title).toBe('测试标题');
    });

    it('应该支持自定义属性', () => {
      const dialog = useDialog();

      dialog.show('内容', '标题', { maxWidth: 500 });

      expect(dialog.dialogs.value[0].attr.maxWidth).toBe(500);
    });
  });

  describe('pop', () => {
    it('应该移除最后一个对话框', () => {
      const dialog = useDialog();
      dialog.show('对话框 1');
      dialog.show('对话框 2');

      dialog.pop();

      expect(dialog.dialogs.value).toHaveLength(1);
    });
  });

  describe('showLoader / hideLoader', () => {
    it('showLoader 应该将 loader 设为 true', () => {
      const dialog = useDialog();

      dialog.showLoader();

      expect(dialog.loader.value).toBe(true);
    });

    it('hideLoader 应该将 loader 设为 false', () => {
      const dialog = useDialog();
      dialog.showLoader();

      dialog.hideLoader();

      expect(dialog.loader.value).toBe(false);
    });
  });

  describe('showConfirm', () => {
    it('应该显示确认对话框', () => {
      const dialog = useDialog();

      // showConfirm 返回 Promise，这里只测试它是否正确设置状态
      dialog.showConfirm('确认内容', '确认标题');

      expect(dialog.confirm.value.visible).toBe(true);
      expect(dialog.confirm.value.content).toBe('确认内容');
      expect(dialog.confirm.value.title).toBe('确认标题');
    });

    it('应该返回 Promise', () => {
      const dialog = useDialog();

      const result = dialog.showConfirm('测试');

      expect(result).toBeInstanceOf(Promise);
    });
  });
});
