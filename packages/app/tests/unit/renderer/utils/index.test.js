import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { isReactive, isRef } from 'vue';

// Mock electron hooks
vi.mock('@/hooks/electron', () => ({
  useDialog: vi.fn(() => ({
    showOpenDialog: vi.fn(),
  })),
  useIpc: vi.fn((wrapped = true) => {
    if (wrapped) {
      return {
        send: vi.fn(),
        invoke: vi.fn(),
      };
    }
    return {
      invoke: vi.fn(),
    };
  }),
}));

// Mock ipcConstant
vi.mock('@pkg/share/utils/ipcConstant', () => ({
  SHOW_TEXT_EDIT_CONTEXT: 'show-text-edit-context',
  OPEN_NEW_WINDOW: 'open-new-window',
}));

describe('renderer/utils/index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useState', () => {
    let useState;

    beforeEach(async () => {
      vi.resetModules();
      const module = await import('@/utils/index');
      useState = module.useState;
    });

    describe('对象类型初始值', () => {
      it('应该返回 reactive 对象', () => {
        const [state] = useState({ count: 0 });

        expect(isReactive(state)).toBe(true);
        expect(state.count).toBe(0);
      });

      it('setValue 应该更新对象属性', () => {
        const [state, setValue] = useState({ count: 0, name: 'test' });

        setValue({ count: 1 });

        expect(state.count).toBe(1);
        expect(state.name).toBe('test');
      });

      it('setValue 函数式更新应该接收当前状态', () => {
        const [state, setValue] = useState({ count: 0 });

        setValue((s) => {
          s.count += 10;
        });

        expect(state.count).toBe(10);
      });

      it('应该支持嵌套对象', () => {
        const [state, setValue] = useState({
          user: { name: 'Alice', age: 20 },
        });

        setValue({ user: { name: 'Bob', age: 25 } });

        expect(state.user.name).toBe('Bob');
        expect(state.user.age).toBe(25);
      });
    });

    describe('原始类型初始值', () => {
      it('应该返回 ref 包装', () => {
        const [state] = useState(0);

        expect(isRef(state)).toBe(true);
        expect(state.value).toBe(0);
      });

      it('setValue 应该更新 ref 值', () => {
        const [state, setValue] = useState(0);

        setValue(10);

        expect(state.value).toBe(10);
      });

      it('setValue 函数式更新应该接收当前值并返回新值', () => {
        const [state, setValue] = useState(5);

        setValue((prev) => prev * 2);

        expect(state.value).toBe(10);
      });

      it('应该支持字符串类型', () => {
        const [state, setValue] = useState('hello');

        setValue('world');

        expect(state.value).toBe('world');
      });

      it('应该支持布尔类型', () => {
        const [state, setValue] = useState(false);

        setValue(true);

        expect(state.value).toBe(true);
      });

      it('应该支持 null 初始值', () => {
        const [state, setValue] = useState(null);

        expect(state.value).toBe(null);

        setValue('not null');
        expect(state.value).toBe('not null');
      });
    });
  });

  describe('showTextEditContextMenu', () => {
    let showTextEditContextMenu;
    let mockIpc;

    beforeEach(async () => {
      vi.resetModules();

      // 重新 mock useIpc
      mockIpc = {
        send: vi.fn(),
        invoke: vi.fn(),
      };

      vi.doMock('@/hooks/electron', () => ({
        useDialog: vi.fn(() => ({
          showOpenDialog: vi.fn(),
        })),
        useIpc: vi.fn(() => mockIpc),
      }));

      const module = await import('@/utils/index');
      showTextEditContextMenu = module.showTextEditContextMenu;
    });

    it('应该获取选中文本并发送 IPC 消息', () => {
      // Mock window.getSelection
      const originalGetSelection = window.getSelection;
      window.getSelection = vi.fn(() => ({
        toString: () => 'selected text',
      }));

      showTextEditContextMenu();

      expect(mockIpc.send).toHaveBeenCalledWith(
        'show-text-edit-context',
        { selectedText: 'selected text' },
      );

      window.getSelection = originalGetSelection;
    });

    it('无选中文本时应发送空字符串', () => {
      const originalGetSelection = window.getSelection;
      window.getSelection = vi.fn(() => ({
        toString: () => '',
      }));

      showTextEditContextMenu();

      expect(mockIpc.send).toHaveBeenCalledWith(
        'show-text-edit-context',
        { selectedText: '' },
      );

      window.getSelection = originalGetSelection;
    });
  });

  describe('appConfigStore', () => {
    let appConfigStore;
    let mockIpcRaw;

    beforeEach(async () => {
      vi.resetModules();

      mockIpcRaw = {
        invoke: vi.fn(() => Promise.resolve('config value')),
      };

      vi.doMock('@/hooks/electron', () => ({
        useDialog: vi.fn(),
        useIpc: vi.fn((wrapped) => {
          if (wrapped === false) {
            return mockIpcRaw;
          }
          return { send: vi.fn(), invoke: vi.fn() };
        }),
      }));

      const module = await import('@/utils/index');
      appConfigStore = module.appConfigStore;
    });

    it('应该代理方法调用到 ipcRaw.invoke', async () => {
      const result = await appConfigStore.get('theme');

      expect(mockIpcRaw.invoke).toHaveBeenCalledWith('appConfigStore', 'get', 'theme');
      expect(result).toBe('config value');
    });

    it('应该支持多个参数', async () => {
      await appConfigStore.set('theme', 'dark');

      expect(mockIpcRaw.invoke).toHaveBeenCalledWith('appConfigStore', 'set', 'theme', 'dark');
    });
  });

  describe('selectFileDialog', () => {
    let selectFileDialog;
    let mockShowOpenDialog;

    beforeEach(async () => {
      vi.resetModules();

      mockShowOpenDialog = vi.fn(() => Promise.resolve({ filePaths: ['/path/to/file'] }));

      vi.doMock('@/hooks/electron', () => ({
        useDialog: vi.fn(() => ({
          showOpenDialog: mockShowOpenDialog,
        })),
        useIpc: vi.fn(() => ({ send: vi.fn(), invoke: vi.fn() })),
      }));

      const module = await import('@/utils/index');
      selectFileDialog = module.selectFileDialog;
    });

    it('应该调用 dialog.showOpenDialog', async () => {
      await selectFileDialog(null);

      expect(mockShowOpenDialog).toHaveBeenCalledWith(null, {
        properties: ['openFile', 'dontAddToRecent'],
      });
    });

    it('应该合并自定义选项', async () => {
      await selectFileDialog(null, {
        filters: [{ name: 'Images', extensions: ['png', 'jpg'] }],
      });

      expect(mockShowOpenDialog).toHaveBeenCalledWith(null, {
        properties: ['openFile', 'dontAddToRecent'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg'] }],
      });
    });
  });
});
