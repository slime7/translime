import { ref } from '@vue/composition-api';
import Vue from 'vue';

const usePluginUi = () => {
  const ui = ref(null);

  const loadScript = (url) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const target = document.getElementsByTagName('script')[0] || document.head;
    script.type = 'text/javascript';
    script.src = url;
    script.onload = resolve;
    script.onerror = reject;
    target.parentNode.insertBefore(script, target);
  });
  const loadUi = async (uiPath, pluginId) => {
    const uiBlob = window.loadPluginUi(uiPath);
    const uiUrl = URL.createObjectURL(uiBlob);
    try {
      await loadScript(uiUrl);
      ui.value = Vue.extend(window[pluginId]);
      return true;
    } catch (err) {
      return false;
    }
  };

  return {
    ui,
    loadUi,
  };
};

export default usePluginUi;
