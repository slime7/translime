import axios from 'axios';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useDialog from '@/hooks/useDialog';

// 使用 node 提供的 http 作为 axios 的 adapter
axios.defaults.adapter = window.electron.axiosHttpAdapter;

export default function usePluginActions(plugin, emit) {
  const ipc = useIpc();
  const { showConfirm } = useDialog();
  const pluginId = plugin.packageName;

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
    enable,
    disable,
    uninstall,
    showContextMenu,
  };
}
