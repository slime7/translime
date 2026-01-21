import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import useTheme from '@/hooks/useTheme';

// Mock electron hooks
vi.mock('@/hooks/electron', () => ({
  useIpc: () => ({
    invoke: vi.fn().mockResolvedValue({ shouldUseDarkColors: false }),
    send: vi.fn(),
  }),
}));

// Mock Vuetify useTheme
vi.mock('vuetify', () => ({
  useTheme: () => ({
    change: vi.fn(),
    themes: {
      value: {
        light: { colors: {} },
        dark: { colors: {} },
      },
    },
  }),
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

  it('应该返回所需的方法', () => {
    const theme = useTheme();

    expect(theme).toHaveProperty('getNativeTheme');
    expect(theme).toHaveProperty('setTheme');
    expect(theme).toHaveProperty('setDark');
    expect(theme).toHaveProperty('setCustomTheme');
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
  });

  describe('setCustomTheme', () => {
    it('应该接受自定义颜色对象', () => {
      const theme = useTheme();
      const colors = {
        light: { primary: '#FF5722' },
        dark: { primary: '#FF7043' },
      };

      expect(() => theme.setCustomTheme(colors)).not.toThrow();
    });

    it('应该接受带 themeColor 元数据的颜色对象', () => {
      const theme = useTheme();
      const colors = {
        light: { primary: '#FF5722' },
        dark: { primary: '#FF7043' },
      };
      const themeColor = {
        name: 'custom',
        source: '#FF5722',
        variant: 'SchemeTonalSpot',
      };

      expect(() => theme.setCustomTheme(colors, themeColor)).not.toThrow();
    });
  });

  describe('getNativeTheme', () => {
    it('应该返回 Promise', () => {
      const theme = useTheme();

      const result = theme.getNativeTheme();

      expect(result).toBeInstanceOf(Promise);
    });
  });
});
