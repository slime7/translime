<template>
  <div class="plugin-container">
    <plugin-ui-loader v-if="loaderVisible" :plugin-path="pluginPath" :plugin-id="pluginId" />
  </div>
</template>

<script>
import {
  computed,
  ref,
  onMounted,
  watch,
} from 'vue';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import useGlobalStore from '@/store/globalStore';
import PluginUiLoader from './PluginUiLoader.vue';

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

  components: {
    PluginUiLoader,
  },

  setup(props) {
    const store = useGlobalStore();

    const plugin = computed(() => (props.packageName ? store.plugins[store.plugins.findIndex((p) => p.packageName === props.packageName)] : null));
    const loaderVisible = ref(false);

    watch(
      () => plugin.value,
      (v, prevV) => {
        loaderVisible.value = (!prevV || !prevV.enabled) && v.enabled;
      },
    );

    onMounted(() => {
      loaderVisible.value = plugin.value && plugin.value.ui;
    });

    return {
      pluginId: plugin.value.packageName,
      pluginPath: plugin.value.ui,
      loaderVisible,
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
