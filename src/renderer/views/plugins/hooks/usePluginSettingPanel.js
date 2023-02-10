import { onBeforeUnmount, onMounted, ref } from 'vue';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';

export default function usePluginSettingPanel(pluginId) {
  const ipc = useIpc();

  const settingPanelVisible = ref(false);
  const showSettingPanel = () => {
    settingPanelVisible.value = true;
  };
  const onShowSettingPanel = () => {
    ipc.on(`${ipcType.OPEN_PLUGIN_SETTING_PANEL}:${pluginId}`, ({ packageName }) => {
      if (packageName === pluginId) {
        showSettingPanel();
      }
    });
  };
  const offShowSettingPanel = () => {
    ipc.detach(`${ipcType.OPEN_PLUGIN_SETTING_PANEL}:${pluginId}`);
  };
  onMounted(() => {
    onShowSettingPanel();
  });
  onBeforeUnmount(() => {
    offShowSettingPanel();
  });

  return {
    settingPanelVisible,
  };
}
