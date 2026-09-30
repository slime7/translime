import { clipboard, shell } from 'electron';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import mainStore from '../../utils/useMainStore';
import appManager from '../../utils/useAppManager';
import { registerMenu } from '../menuRegistry';

/**
 * 把 Electron MenuItem 风格的菜单模板序列化为渲染端 mat-menu 描述。
 *
 * 可见性过滤在此完成；只透传渲染端支持的子集（label、checkbox 选中态、
 * enabled 与分隔线），插件自定义菜单中暂不支持的能力（子菜单、图标等）被忽略。
 *
 * @param {Array<object>} template - 菜单模板。
 * @returns {{actions: Map<string, Function>, items: Array<object>}}
 */
const serializeMenu = (template) => {
  const actions = new Map();
  const items = [];
  template.forEach((item, index) => {
    if (item.visible === false) {
      return;
    }
    if (item.type === 'separator') {
      items.push({ type: 'separator' });
      return;
    }
    const itemId = item.id || `item-${index}`;
    if (actions.has(itemId)) {
      // 同一份菜单内 id 重复时只保留首个，避免回传动作命中错误处理函数
      return;
    }
    actions.set(itemId, item.click);
    items.push({
      id: itemId,
      label: item.label,
      ...(item.type === 'checkbox' ? { checked: Boolean(item.checked) } : {}),
      ...(item.enabled === undefined ? {} : { enabled: Boolean(item.enabled) }),
    });
  });
  return { actions, items };
};

/**
 * 构建插件上下文菜单的可序列化描述，交给渲染端 mat-menu 展示。
 *
 * 菜单项会根据插件当前状态动态显隐，并把插件自定义菜单追加到末尾；
 * 各项目的处理函数随描述一并登记，渲染端点击后回传 menuId 与菜单项 id 执行。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {string} packageName - 插件包名。
 * @returns {{menuId: string, items: Array<object>}} 渲染端菜单描述。
 */
const buildPluginMenu = (loader, packageName) => {
  const plugin = loader.getPlugin(packageName);
  const ipcEv = appManager.getIpc();

  const contextMenuItems = [
    {
      id: 'disable-plugin',
      label: '禁用插件',
      visible: plugin.enabled,
      click() {
        loader.disablePlugin(packageName);
        ipcEv.sendToMain(ipcType.PLUGINS_CHANGED);
      },
    },
    {
      id: 'enable-plugin',
      label: '启用插件',
      visible: !plugin.enabled,
      click() {
        loader.enablePlugin(packageName);
        ipcEv.sendToMain(ipcType.PLUGINS_CHANGED);
      },
    },
    {
      id: 'restart-plugin',
      label: '重启插件',
      visible: plugin.enabled,
      click() {
        loader.restartPlugin(packageName);
        ipcEv.sendToMain(ipcType.PLUGINS_CHANGED);
      },
    },
    {
      id: 'open-plugin-dir',
      label: '打开插件目录',
      // 仅对明确标记为开发插件的条目展示，非 dev 插件（含 dev 字段缺失）一律隐藏
      visible: plugin.dev === true,
      click() {
        shell.openPath(plugin.pluginPath);
      },
    },
    {
      id: 'uninstall-plugin',
      label: '卸载插件',
      click() {
        loader.uninstallPlugin(packageName).then(() => {
          ipcEv.sendToMain(ipcType.PLUGINS_CHANGED);
        });
      },
    },
    {
      id: 'open-plugin-setting-panel',
      label: '设置',
      visible:
        plugin.enabled && !!plugin.settingMenu && !!plugin.settingMenu.length,
      click() {
        const mainWin = appManager.getWin();
        if (mainWin) {
          if (mainWin.isMinimized()) {
            mainWin.restore();
          }
          mainWin.focus();
        }
        ipcEv.sendToMain(ipcType.OPEN_PLUGIN_SETTING_PANEL, {
          packageName,
        });
      },
    },
    {
      id: 'switch-plugin-window-mode',
      label: '新窗口打开插件',
      type: 'checkbox',
      checked: plugin.windowMode,
      visible: !!plugin.ui && !plugin.windowUrl,
      click() {
        plugin.windowMode = !plugin.windowMode;
        mainStore.config.set(
          `plugin.${packageName}.windowMode`,
          plugin.windowMode,
        );
        if (
          !plugin.windowMode
          && appManager.getChildWin(`plugin-window-${packageName}`)
        ) {
          appManager.getChildWin(`plugin-window-${packageName}`).close();
        }
        ipcEv.sendToMain(ipcType.PLUGINS_CHANGED);
      },
    },
    {
      id: 'copy-plugin-link',
      label: '复制分享链接',
      click() {
        clipboard.writeText(
          `https://slime7.github.io/translime/open/?install=${packageName}`,
        );
        ipcEv.sendToMain(ipcType.IPC_TOAST, ['链接已复制']);
      },
    },
  ];
  if (Array.isArray(plugin.pluginMenu) && plugin.pluginMenu.length) {
    contextMenuItems.push({ type: 'separator' }, ...plugin.pluginMenu);
  }

  const { actions, items } = serializeMenu(contextMenuItems);
  return { menuId: registerMenu(actions), items };
};

export default buildPluginMenu;
