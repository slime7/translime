import { clipboard, Menu } from 'electron';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import mainStore from '../../utils/useMainStore';
import appManager from '../../utils/useAppManager';

/**
 * 构建并弹出插件右键菜单。
 *
 * 菜单项会根据插件当前状态动态显隐，并把插件自定义菜单追加到末尾。
 *
 * @param {object} loader - `PluginLoader` 实例。
 * @param {string} packageName - 插件包名。
 * @param {object} ipcEv - 当前 IPC 事件包装对象。
 * @returns {void}
 */
const popPluginMenu = (loader, packageName, ipcEv) => {
  const plugin = loader.getPlugin(packageName);

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
  const menuDivider = {
    type: 'separator',
  };
  if (Array.isArray(plugin.pluginMenu) && plugin.pluginMenu.length) {
    contextMenuItems.push(menuDivider, ...plugin.pluginMenu);
  }

  const menu = Menu.buildFromTemplate(contextMenuItems);
  menu.popup();
};

export default popPluginMenu;
