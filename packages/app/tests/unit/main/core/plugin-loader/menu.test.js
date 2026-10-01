import {
  afterAll, beforeAll, beforeEach, describe, expect, it, vi,
} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clipboard } from 'electron';

import { dispatchMenuAction } from '@main/core/menuRegistry';
import buildPluginMenu from '@main/core/plugin-loader/menu';

const {
  mockConfigSet, mockSendToMain, mockIpcEv, mockShellOpenPath,
} = vi.hoisted(() => {
  const sendToMain = vi.fn();
  return {
    mockConfigSet: vi.fn(),
    mockSendToMain: sendToMain,
    mockIpcEv: { sendToMain },
    mockShellOpenPath: vi.fn(),
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'C:/mock-userdata'),
  },
  clipboard: {
    writeText: vi.fn(),
  },
  shell: {
    openPath: mockShellOpenPath,
  },
}));

vi.mock('@main/utils/useMainStore', () => ({
  default: {
    config: {
      set: mockConfigSet,
    },
  },
}));

vi.mock('@main/utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@main/core/plugin-loader/isolatedRuntime', () => ({
  activateIsolatedPlugin: vi.fn(),
  deactivateIsolatedPlugin: vi.fn(),
  notifySettingSaved: vi.fn(),
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
  let tempPluginDir;

  beforeAll(() => {
    // 真实入口产物：供元数据延迟加载（ensurePluginMetadata）用 require 读取
    tempPluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translime-menu-meta-'));
    fs.mkdirSync(path.join(tempPluginDir, 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(tempPluginDir, 'dist', 'index.cjs.js'),
      'module.exports = { settingMenu: [{ type: "input", name: "演示设置" }] };',
      'utf8',
    );
  });

  afterAll(() => {
    fs.rmSync(tempPluginDir, { recursive: true, force: true });
  });

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

  it('仅开发插件展示“打开插件目录”，与启用状态无关', () => {
    const devEnabled = createLoader({ dev: true });
    expect(itemIds(buildPluginMenu(devEnabled.loader, 'p').items)).toContain('open-plugin-dir');

    const devDisabled = createLoader({ dev: true, enabled: false, ui: false });
    expect(itemIds(buildPluginMenu(devDisabled.loader, 'p').items)).toContain('open-plugin-dir');

    const releasePlugin = createLoader({ dev: false });
    expect(itemIds(buildPluginMenu(releasePlugin.loader, 'p').items)).not.toContain('open-plugin-dir');
  });

  it('回传动作应执行对应处理：打开插件目录', () => {
    const { loader } = createLoader({ dev: true, pluginPath: 'C:/mock/translime-plugin-demo' });
    const { menuId } = buildPluginMenu(loader, 'translime-plugin-demo');

    dispatchMenuAction(menuId, 'open-plugin-dir');

    expect(mockShellOpenPath).toHaveBeenCalledWith('C:/mock/translime-plugin-demo');
  });

  it('有设置项的插件展示“设置”，与启用状态无关', () => {
    const enabledWithSettings = createLoader({ settingMenu: [{ label: 'general' }] });
    expect(itemIds(buildPluginMenu(enabledWithSettings.loader, 'p').items)).toContain(
      'open-plugin-setting-panel',
    );

    // 设置面板是声明式元数据，未启用的插件同样可以打开并预配置
    const disabledWithSettings = createLoader({
      enabled: false,
      settingMenu: [{ label: 'general' }],
    });
    expect(itemIds(buildPluginMenu(disabledWithSettings.loader, 'p').items)).toContain(
      'open-plugin-setting-panel',
    );

    const withoutSettings = createLoader();
    expect(itemIds(buildPluginMenu(withoutSettings.loader, 'p').items)).not.toContain(
      'open-plugin-setting-panel',
    );
  });

  it('打开菜单应延迟加载入口的 settingMenu，不触发激活', () => {
    // 防止的回归：settingMenu 在插件激活时才合并进主进程插件对象，
    // 若菜单不按需加载静态元数据，未激活插件的配置面板入口会消失
    const { loader, plugin } = createLoader({
      enabled: false,
      exports: 'dist/index.cjs.js',
      pluginPath: tempPluginDir,
    });

    const { items } = buildPluginMenu(loader, 'translime-plugin-demo');

    expect(plugin.metadataLoaded).toBe(true);
    expect(plugin.settingMenu).toEqual([{ type: 'input', name: '演示设置' }]);
    expect(itemIds(items)).toContain('open-plugin-setting-panel');
    // 元数据加载不等于激活：运行期启用入口不应被调用
    expect(loader.enablePlugin).not.toHaveBeenCalled();
  });

  it('入口产物缺失时菜单不展示设置且不抛错', () => {
    const { loader, plugin } = createLoader({
      enabled: false,
      exports: 'dist/index.cjs.js',
      pluginPath: path.join(tempPluginDir, 'not-exist'),
    });

    expect(() => buildPluginMenu(loader, 'translime-plugin-demo')).not.toThrow();
    expect(plugin.metadataLoaded).toBeUndefined();
    expect(itemIds(buildPluginMenu(loader, 'translime-plugin-demo').items)).not.toContain(
      'open-plugin-setting-panel',
    );
  });

  it('隔离插件不在主进程预读元数据，避免顶层代码双进程执行', () => {
    const { loader, plugin } = createLoader({
      isolated: true,
      exports: 'dist/index.cjs.js',
      pluginPath: tempPluginDir,
    });

    buildPluginMenu(loader, 'translime-plugin-demo');

    expect(plugin.metadataLoaded).toBeUndefined();
    expect(plugin.settingMenu).toEqual([]);
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
