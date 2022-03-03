<template>
  <div class="plugin-container">
    <component v-if="ui" :is="ui" />
  </div>
</template>

<script>
import { computed, onMounted, watch } from '@vue/composition-api';
import * as components from 'vuetify/lib/components';
import * as directives from 'vuetify/lib/directives';
import useGlobalStore from '@/store/globalStore';
import useAlert from '@/hooks/useAlert';
import usePluginUi from './hooks/usePluginUi';

if (!window.vuetify$) {
  window.vuetify$ = {
    components,
    directives,
  };
}

export default {
  name: 'PluginPage',

  props: {
    packageName: {
      default: '',
      type: String,
    },
  },

  setup(props) {
    const store = useGlobalStore();
    const pluginUi = usePluginUi();
    const alert = useAlert();

    const plugin = computed(() => (props.packageName ? store.plugins[store.plugins.findIndex((p) => p.packageName === props.packageName)] : null));

    watch(
      () => plugin.value.enabled,
      async (v, prevV) => {
        if (!prevV && v) {
          const result = await pluginUi.loadUi(plugin.value.ui, props.packageName);
          if (!result) {
            alert.show('加载插件页面失败', 'error');
          }
        }
      },
    );

    onMounted(async () => {
      console.log('mounted', plugin.value);
      if (plugin.value && plugin.value.ui) {
        const result = await pluginUi.loadUi(plugin.value.ui, props.packageName);
        if (!result) {
          alert.show('加载插件页面失败', 'error');
        }
      }
    });

    return {
      ui: pluginUi.ui,
    };
  },
};
</script>

<style scoped lang="scss">
.plugin-container {
  width: 100%;
  height: 100%;

  .webview {
    width: 100%;
    min-height: 100%;
  }

  .dev-fab {
    position: fixed;
    bottom: 16px;
    right: 16px;
  }
}
</style>
