<script setup>
import {
  markRaw,
  onMounted,
  onUnmounted,
  ref,
} from 'vue';

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

const mountPlugin = async () => {
  try {
    const uiBlob = window.ts.loadPluginUi(props.pluginPath);
    if (currentUiUrl) {
      URL.revokeObjectURL(currentUiUrl);
    }
    currentUiUrl = URL.createObjectURL(uiBlob);
    const ui = await import(/* @vite-ignore */ currentUiUrl);
    PluginUi.value = markRaw(ui.default || ui);
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
