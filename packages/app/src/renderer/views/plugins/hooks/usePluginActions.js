import useDialog from '@/hooks/useDialog';
import useMenuStore from '@/store/menuStore';

export default function usePluginActions(plugin, emit) {
  const { showConfirm } = useDialog();
  const menu = useMenuStore();
  const pluginId = plugin.packageName;

  const install = (version) => {
    emit('install', version ? `${pluginId}@${version}` : pluginId);
  };
  const enable = () => {
    emit('enable', pluginId);
  };
  const disable = () => {
    emit('disable', pluginId);
  };
  const reallyUninstall = () => {
    emit('uninstall', pluginId);
  };
  const uninstall = async () => {
    const confirmResult = await showConfirm(`确定要卸载插件”${plugin.title}“吗？`, '卸载确认');
    if (confirmResult.confirm) {
      reallyUninstall();
    }
  };
  const showContextMenu = (event) => {
    menu.openPluginMenu(pluginId, event);
  };

  return {
    install,
    enable,
    disable,
    uninstall,
    showContextMenu,
  };
}
