import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { clipboard } from 'electron';

import { dispatchMenuAction } from '@main/core/menuRegistry';
import buildPluginMenu from '@main/core/plugin-loader/menu';

const { mockConfigSet, mockSendToMain, mockIpcEv } = vi.hoisted(() => {
  const sendToMain = vi.fn();
  return {
    mockConfigSet: vi.fn(),
    mockSendToMain: sendToMain,
    mockIpcEv: { sendToMain },
  };
});

vi.mock('electron', () => ({
  clipboard: {
    writeText: vi.fn(),
  },
}));

vi.mock('@main/utils/useMainStore', () => ({
  default: {
    config: {
      set: mockConfigSet,
    },
  },
}));

vi.mock('@main/utils/useAppManager', () => ({
  default: {
    getIpc: vi.fn(() => mockIpcEv),
    getWin: vi.fn(),
    getChildWin: vi.fn(),
  },
}));

const createLoader = (pluginOverrides = {}) => {
  const plugin = {
    enabled: true,
    windowMode: false,
    ui: true,
    windowUrl: null,
    settingMenu: [],
    pluginMenu: [],
    ...pluginOverrides,
  };
  return {
    plugin,
    loader: {
      getPlugin: vi.fn(() => plugin),
      disablePlugin: vi.fn(),
      enablePlugin: vi.fn(),
      restartPlugin: vi.fn(),
      uninstallPlugin: vi.fn(() => Promise.resolve()),
    },
  };
};

const itemIds = (items) => items.map((item) => item.id ?? item.type);

describe('plugin-loader/menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('启用的插件应展示禁用/重启/卸载，而不展示启用', () => {
    const { loader } = createLoader();
    const { items } = buildPluginMenu(loader, 'translime-plugin-demo');

    expect(itemIds(items)).toContain('disable-plugin');
    expect(itemIds(items)).toContain('restart-plugin');
    expect(itemIds(items)).toContain('uninstall-plugin');
    expect(itemIds(items)).not.toContain('enable-plugin');
  });

  it('禁用且无 UI 的插件只展示启用/卸载', () => {
    const { loader } = createLoader({ enabled: false, ui: false });
    const { items } = buildPluginMenu(loader, 'translime-plugin-demo');

    expect(itemIds(items)).toEqual(['enable-plugin', 'uninstall-plugin', 'copy-plugin-link']);
  });

  it('有设置项的启用插件才展示“设置”', () => {
    const withSettings = createLoader({ settingMenu: [{ label: 'general' }] });
    expect(itemIds(buildPluginMenu(withSettings.loader, 'p').items)).toContain(
      'open-plugin-setting-panel',
    );

    const withoutSettings = createLoader();
    expect(itemIds(buildPluginMenu(withoutSettings.loader, 'p').items)).not.toContain(
      'open-plugin-setting-panel',
    );
  });

  it('带 UI 且未固定 windowUrl 的插件才展示窗口模式开关，并透传选中态', () => {
    const withUi = createLoader({ windowMode: true });
    const { items } = buildPluginMenu(withUi.loader, 'p');
    const switchItem = items.find((item) => item.id === 'switch-plugin-window-mode');
    expect(switchItem).toMatchObject({ checked: true });

    const withWindowUrl = createLoader({ windowUrl: 'index.html' });
    expect(itemIds(buildPluginMenu(withWindowUrl.loader, 'p').items)).not.toContain(
      'switch-plugin-window-mode',
    );
  });

  it('菜单描述应可序列化（不携带处理函数）', () => {
    const { loader } = createLoader({
      pluginMenu: [{ id: 'custom', label: 'custom', click: vi.fn() }],
    });
    const { items } = buildPluginMenu(loader, 'translime-plugin-demo');

    expect(JSON.parse(JSON.stringify(items))).toEqual(items);
  });

  it('插件自定义菜单应过滤不可见项并追加在内置项之后的分隔线上', () => {
    const { loader } = createLoader({
      pluginMenu: [
        { id: 'custom-a', label: 'custom a', click: vi.fn() },
        {
          id: 'hidden', label: 'hidden', visible: false, click: vi.fn(),
        },
      ],
    });
    const { items } = buildPluginMenu(loader, 'translime-plugin-demo');
    const ids = itemIds(items);

    expect(ids).not.toContain('hidden');
    expect(ids.slice(-2)).toEqual(['separator', 'custom-a']);
    expect(ids).toContain('disable-plugin');
  });

  it('回传动作应执行对应处理：禁用插件并广播插件变更', () => {
    const { loader } = createLoader();
    const { menuId } = buildPluginMenu(loader, 'translime-plugin-demo');

    dispatchMenuAction(menuId, 'disable-plugin');

    expect(loader.disablePlugin).toHaveBeenCalledWith('translime-plugin-demo');
    expect(mockSendToMain).toHaveBeenCalledWith('plugins-changed');
  });

  it('回传动作应执行对应处理：卸载完成后广播插件变更', async () => {
    const { loader } = createLoader();
    const { menuId } = buildPluginMenu(loader, 'translime-plugin-demo');

    dispatchMenuAction(menuId, 'uninstall-plugin');
    await Promise.resolve();
    await Promise.resolve();

    expect(loader.uninstallPlugin).toHaveBeenCalledWith('translime-plugin-demo');
    expect(mockSendToMain).toHaveBeenCalledWith('plugins-changed');
  });

  it('回传动作应执行对应处理：切换窗口模式并持久化', () => {
    const { loader, plugin } = createLoader({ windowMode: false });
    const { menuId } = buildPluginMenu(loader, 'translime-plugin-demo');

    dispatchMenuAction(menuId, 'switch-plugin-window-mode');

    expect(plugin.windowMode).toBe(true);
    expect(mockConfigSet).toHaveBeenCalledWith(
      'plugin.translime-plugin-demo.windowMode',
      true,
    );
    expect(mockSendToMain).toHaveBeenCalledWith('plugins-changed');
  });

  it('回传动作应执行对应处理：复制分享链接并提示', () => {
    const { loader } = createLoader();
    const { menuId } = buildPluginMenu(loader, 'translime-plugin-demo');

    dispatchMenuAction(menuId, 'copy-plugin-link');

    expect(clipboard.writeText).toHaveBeenCalledWith(
      'https://slime7.github.io/translime/open/?install=translime-plugin-demo',
    );
    expect(mockSendToMain).toHaveBeenCalledWith('ipc-toast', ['链接已复制']);
  });

  it('回传动作应执行插件自定义菜单的点击处理', () => {
    const customClick = vi.fn();
    const { loader } = createLoader({
      pluginMenu: [{ id: 'custom-a', label: 'custom a', click: customClick }],
    });
    const { menuId } = buildPluginMenu(loader, 'translime-plugin-demo');

    dispatchMenuAction(menuId, 'custom-a');

    expect(customClick).toHaveBeenCalledTimes(1);
  });
});
