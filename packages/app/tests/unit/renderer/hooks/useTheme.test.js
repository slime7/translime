import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import useTheme from '@/hooks/useTheme';

const { mockIpc, matThemeMock } = vi.hoisted(() => ({
  mockIpc: {
    invoke: vi.fn().mockResolvedValue({ shouldUseDarkColors: false }),
    send: vi.fn(),
  },
  matThemeMock: {
    setMode: vi.fn(),
    setSeedColor: vi.fn(),
    setSchemeVariant: vi.fn(),
  },
}));

// Mock electron hooks
vi.mock('@/hooks/electron', () => ({
  useIpc: () => mockIpc,
}));

// Mock mde-vue 主题控制器（宿主 UI 主题）
vi.mock('@/plugins/matUi', () => ({
  default: {
    theme: matThemeMock,
  },
}));

// Mock appConfigStore
vi.mock('@/utils', () => ({
  appConfigStore: {
    set: vi.fn(),
    get: vi.fn(),
  },
}));

describe('useTheme', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应该返回所需的方法', () => {
    const theme = useTheme();

    expect(theme).toHaveProperty('getNativeTheme');
    expect(theme).toHaveProperty('setTheme');
    expect(theme).toHaveProperty('setDark');
    expect(theme).toHaveProperty('setCustomTheme');
    expect(theme).toHaveProperty('syncMatTheme');
    expect(theme).toHaveProperty('syncOverlayColor');
  });

  describe('setTheme', () => {
    it('应该接受 dark、light、system 主题', () => {
      const theme = useTheme();

      expect(() => theme.setTheme('dark')).not.toThrow();
      expect(() => theme.setTheme('light')).not.toThrow();
      expect(() => theme.setTheme('system')).not.toThrow();
    });

    it('无效主题应该回退到 system', () => {
      const theme = useTheme();

      // 不应该抛出错误
      expect(() => theme.setTheme('invalid')).not.toThrow();
    });
  });

  describe('setDark', () => {
    it('应该设置深色模式', () => {
      const theme = useTheme();

      expect(() => theme.setDark(true)).not.toThrow();
      expect(() => theme.setDark(false)).not.toThrow();
    });

    it('应该同步明暗模式到 mde-vue 主题控制器', () => {
      const theme = useTheme();

      theme.setDark(true);
      expect(matThemeMock.setMode).toHaveBeenCalledWith('dark');

      theme.setDark(false);
      expect(matThemeMock.setMode).toHaveBeenCalledWith('light');
    });
  });

  describe('syncMatTheme', () => {
    it('默认配色应重置为 translime 种子色与 expressive 变体', () => {
      const theme = useTheme();

      theme.syncMatTheme({ name: 'translime', source: '#123456', variant: 'SchemeVibrant' });

      expect(matThemeMock.setSeedColor).toHaveBeenCalledWith('#20a6fc');
      expect(matThemeMock.setSchemeVariant).toHaveBeenCalledWith('expressive');
    });

    it('自定义配色应同步源色与变体到 mde-vue 命名', () => {
      const theme = useTheme();

      theme.syncMatTheme({ name: 'custom', source: '#346b4f', variant: 'SchemeTonalSpot' });

      expect(matThemeMock.setSeedColor).toHaveBeenCalledWith('#346b4f');
      expect(matThemeMock.setSchemeVariant).toHaveBeenCalledWith('tonal-spot');
    });
  });

  describe('setCustomTheme', () => {
    it('保存配色元数据并同步到 mde-vue 主题控制器', () => {
      const theme = useTheme();

      theme.setCustomTheme({
        name: 'custom',
        source: '#FF5722',
        variant: 'SchemeTonalSpot',
      });

      expect(matThemeMock.setSeedColor).toHaveBeenCalledWith('#FF5722');
      expect(matThemeMock.setSchemeVariant).toHaveBeenCalledWith('tonal-spot');
      expect(mockIpc.send).toHaveBeenCalledWith(ipcType.THEME_COLOR_UPDATED);
    });

    it('未传配色元数据时不做任何处理', () => {
      const theme = useTheme();

      expect(() => theme.setCustomTheme()).not.toThrow();
      expect(matThemeMock.setSeedColor).not.toHaveBeenCalled();
      expect(mockIpc.send).not.toHaveBeenCalled();
    });
  });

  describe('getNativeTheme', () => {
    it('应该返回 Promise', () => {
      const theme = useTheme();

      const result = theme.getNativeTheme();

      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('syncOverlayColor', () => {
    // syncOverlayColor 从文档根节点读取 mde-vue 写入的 --mat-sys-color-* 令牌，
    // jsdom 不做样式计算，按测试需要伪造令牌取值
    const stubMatColorToken = (value) => {
      vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({
        getPropertyValue: (name) => (name === '--mat-sys-color-on-surface' ? value : ''),
      }));
    };

    it('令牌色可规范化时发送 hex 图标色', () => {
      const fakeCtx = { fillStyle: '#000000' };
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'canvas') {
          return { getContext: () => fakeCtx };
        }
        return document.createElement(tag);
      });
      stubMatColorToken('#1d1b20');
      const theme = useTheme();

      theme.syncOverlayColor();

      expect(mockIpc.send).toHaveBeenCalledWith(ipcType.SET_TITLE_BAR_OVERLAY, {
        win: 'app',
        symbolColor: '#1d1b20',
      });
    });

    it('环境无法规范化颜色时回退模式默认色', () => {
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'canvas') {
          return { getContext: () => null };
        }
        return document.createElement(tag);
      });
      stubMatColorToken('#1d1b20');
      const theme = useTheme();

      theme.syncOverlayColor('plugin-window-demo');

      expect(mockIpc.send).toHaveBeenCalledWith(ipcType.SET_TITLE_BAR_OVERLAY, {
        win: 'plugin-window-demo',
        symbolColor: '#1f1f1f',
      });
    });

    it('令牌缺失时回退模式默认色', () => {
      const fakeCtx = { fillStyle: '#000000' };
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'canvas') {
          return { getContext: () => fakeCtx };
        }
        return document.createElement(tag);
      });
      stubMatColorToken('');
      const theme = useTheme();

      theme.syncOverlayColor();

      expect(mockIpc.send).toHaveBeenCalledWith(ipcType.SET_TITLE_BAR_OVERLAY, {
        win: 'app',
        symbolColor: '#1f1f1f',
      });
    });
  });
});
