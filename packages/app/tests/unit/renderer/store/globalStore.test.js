import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

import { createPinia, setActivePinia } from 'pinia';
import useGlobalStore from '@/store/globalStore';

const { appConfigStoreMock } = vi.hoisted(() => ({
  appConfigStoreMock: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('@/utils', () => ({
  appConfigStore: appConfigStoreMock,
}));

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

describe('globalStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    appConfigStoreMock.get.mockImplementation((key, fallback) => Promise.resolve(fallback));
    appConfigStoreMock.set.mockResolvedValue(undefined);
  });

  describe('初始状态', () => {
    it('应该有正确的默认值', () => {
      const store = useGlobalStore();

      expect(store.versions).toBe(null);
      expect(store.plugins).toEqual([]);
      expect(store.dark).toBe(false);
      expect(store.appArgv).toEqual([]);
      expect(store.appSetting.openAtLogin).toBe(false);
      expect(store.appSetting.theme).toBe('system');
      expect(store.appSetting.themeColor.variant).toBe('SchemeExpressive');
    });
  });

  describe('setPlugins', () => {
    it('应该正确设置插件列表', () => {
      const store = useGlobalStore();
      const plugins = [
        { packageName: 'plugin-a', title: 'Plugin A' },
        { packageName: 'plugin-b', title: 'Plugin B' },
      ];

      store.setPlugins(plugins);

      expect(store.plugins).toEqual(plugins);
      expect(store.plugins).toHaveLength(2);
    });

    it('应该能够清空插件列表', () => {
      const store = useGlobalStore();
      store.setPlugins([{ packageName: 'test' }]);
      store.setPlugins([]);

      expect(store.plugins).toEqual([]);
    });
  });

  describe('updatePlugin', () => {
    it('应该正确更新已存在的插件', () => {
      const store = useGlobalStore();
      store.setPlugins([
        { packageName: 'plugin-a', title: 'Old Title', enabled: false },
      ]);

      store.updatePlugin('plugin-a', { title: 'New Title', enabled: true });

      expect(store.plugins[0].title).toBe('New Title');
      expect(store.plugins[0].enabled).toBe(true);
      expect(store.plugins[0].packageName).toBe('plugin-a');
    });

    it('不存在的插件不应该影响列表', () => {
      const store = useGlobalStore();
      store.setPlugins([{ packageName: 'plugin-a' }]);

      store.updatePlugin('non-existent', { title: 'Test' });

      expect(store.plugins).toHaveLength(1);
      expect(store.plugins[0].packageName).toBe('plugin-a');
    });
  });

  describe('plugin getter', () => {
    it('应该按 packageName 查找插件', () => {
      const store = useGlobalStore();
      store.setPlugins([
        { packageName: 'plugin-a', title: 'Plugin A' },
        { packageName: 'plugin-b', title: 'Plugin B' },
      ]);

      const plugin = store.plugin('plugin-b');

      expect(plugin).toBeDefined();
      expect(plugin.title).toBe('Plugin B');
    });

    it('找不到插件时应该返回 undefined', () => {
      const store = useGlobalStore();
      store.setPlugins([{ packageName: 'plugin-a' }]);

      const plugin = store.plugin('non-existent');

      expect(plugin).toBeUndefined();
    });
  });

  describe('setter actions', () => {
    it('setAppOpenAtLogin 应该正确设置开机启动', () => {
      const store = useGlobalStore();

      store.setAppOpenAtLogin(true);
      expect(store.appSetting.openAtLogin).toBe(true);

      store.setAppOpenAtLogin(false);
      expect(store.appSetting.openAtLogin).toBe(false);
    });

    it('setAppTheme 应该正确设置主题', () => {
      const store = useGlobalStore();

      store.setAppTheme('dark');
      expect(store.appSetting.theme).toBe('dark');

      store.setAppTheme('light');
      expect(store.appSetting.theme).toBe('light');
    });

    it('setAppRegistry 应该正确设置 npm 源', () => {
      const store = useGlobalStore();

      store.setAppRegistry('https://registry.npmjs.org/');
      expect(store.appSetting.registry).toBe('https://registry.npmjs.org/');
    });

    it('setShowDevPlugin 应该正确设置开发插件显示', () => {
      const store = useGlobalStore();

      store.setShowDevPlugin(true);
      expect(store.appSetting.showDevPlugin).toBe(true);
    });

    it('setAppArgv 应该正确设置启动参数', () => {
      const store = useGlobalStore();
      const argv = ['--dev', '--debug'];

      store.setAppArgv(argv);
      expect(store.appArgv).toEqual(argv);
    });

    it('setAppThemeColor 应该正确设置主题颜色', () => {
      const store = useGlobalStore();
      const themeColor = {
        name: 'custom',
        source: '#FF5722',
        variant: 'SchemeTonalSpot',
      };

      store.setAppThemeColor(themeColor);
      expect(store.appSetting.themeColor).toEqual(themeColor);
    });

    it('读取旧主题方案时应该迁移并回写 Expressive', async () => {
      appConfigStoreMock.get.mockImplementation((key, fallback) => {
        if (key === 'setting.themeColor') {
          return Promise.resolve({
            name: 'custom',
            source: '#123456',
            variant: 'SchemeRainbow',
          });
        }
        return Promise.resolve(fallback);
      });
      const store = useGlobalStore();

      await store.initAppConfig();

      expect(store.appSetting.themeColor).toEqual({
        name: 'custom',
        source: '#123456',
        variant: 'SchemeExpressive',
      });
      expect(appConfigStoreMock.set).toHaveBeenCalledWith('setting.themeColor', {
        name: 'custom',
        source: '#123456',
        variant: 'SchemeExpressive',
      });
    });
  });
});
