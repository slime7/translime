<script setup>
import {
  markRaw,
  onMounted,
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
const mountPlugin = async () => {
  try {
    const uiBlob = window.ts.loadPluginUi(props.pluginPath);
    const uiUrl = URL.createObjectURL(uiBlob);
    const ui = await import(/* @vite-ignore */ uiUrl);
    PluginUi.value = markRaw(ui.default);
    visible.value = true;
  } catch (err) {
    error.value = err.message;
  }
};

onMounted(() => {
  mountPlugin();
});
</script>

<template>
  <div class="plugin-ui-loader" :data-plugin-id="pluginId">
    <template v-if="visible">
      <component :is="PluginUi" />
    </template>

    <div v-else>{{ error }}</div>
  </div>
</template>
