<script setup>
import {
  defineComponent,
  h,
  markRaw,
  onMounted,
  onUnmounted,
  ref,
} from 'vue';
import { withPluginRuntimeContext } from '@/utils/pluginStyleIsolation';

const props = defineProps({
  pluginId: {
    type: String,
    required: true,
  },
  pluginPath: {
    type: String,
    required: true,
  },
});

const visible = ref(false);
const PluginUi = ref();
const error = ref(null);
let currentUiUrl = '';

const createScopedPluginComponent = (component, pluginId) => defineComponent({
  name: `ScopedPluginUi_${pluginId}`,
  setup() {
    return () => withPluginRuntimeContext(pluginId, () => h(component));
  },
});

const mountPlugin = async () => {
  try {
    const uiBlob = await withPluginRuntimeContext(
      props.pluginId,
      () => window.ts.loadPluginUi(props.pluginPath),
    );
    if (currentUiUrl) {
      URL.revokeObjectURL(currentUiUrl);
    }
    currentUiUrl = URL.createObjectURL(uiBlob);
    const ui = await withPluginRuntimeContext(
      props.pluginId,
      () => import(/* @vite-ignore */ currentUiUrl),
    );
    const pluginComponent = ui.default || ui;
    PluginUi.value = markRaw(createScopedPluginComponent(pluginComponent, props.pluginId));
    visible.value = true;
  } catch (err) {
    error.value = err.message;
  }
};

onMounted(() => {
  mountPlugin();
});

onUnmounted(() => {
  if (currentUiUrl) {
    URL.revokeObjectURL(currentUiUrl);
  }
});
</script>

<template>
  <div class="plugin-ui-loader" :data-plugin-id="pluginId">
    <template v-if="visible">
      <component :is="PluginUi" />
    </template>

    <div v-else>
      {{ error }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.plugin-ui-loader {
  min-height: calc(100% - 48px);
}
</style>
