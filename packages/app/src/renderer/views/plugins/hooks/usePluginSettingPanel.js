import { ref } from 'vue';

export default function usePluginSettingPanel() {
  const settingPanelVisible = ref(false);
  const showSettingPanel = () => {
    settingPanelVisible.value = true;
  };

  return {
    showSettingPanel,
    settingPanelVisible,
  };
}
