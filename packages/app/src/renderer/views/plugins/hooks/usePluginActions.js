import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useDialog from '@/hooks/useDialog';

export default function usePluginActions(plugin, emit) {
  const ipc = useIpc();
  const { showConfirm } = useDialog();
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
  const showContextMenu = () => {
    ipc.send(ipcType.OPEN_PLUGIN_CONTEXT_MENU, pluginId);
  };

  return {
    install,
    enable,
    disable,
    uninstall,
    showContextMenu,
  };
}
