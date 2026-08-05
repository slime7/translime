<script setup>
import {
  computed,
  defineComponent,
  h,
  markRaw,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue';
import { withPluginRuntimeContext } from '@/utils/pluginStyleIsolation';
import useGlobalStore from '@/store/globalStore';

const props = defineProps({
  packageName: {
    type: String,
    required: true,
  },
});

const store = useGlobalStore();
const plugin = computed(() => store.plugin(props.packageName));
const pluginId = computed(() => plugin.value?.packageName);
const pluginPath = computed(() => plugin.value?.ui);

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
  if (!plugin.value || !pluginPath.value) {
    return;
  }
  try {
    const uiBlob = await withPluginRuntimeContext(
      pluginId.value,
      () => window.ts.loadPluginUi(pluginPath.value),
    );

    if (currentUiUrl) {
      URL.revokeObjectURL(currentUiUrl);
    }
    currentUiUrl = URL.createObjectURL(uiBlob);

    const ui = await withPluginRuntimeContext(
      pluginId.value,
      () => import(/* @vite-ignore */ currentUiUrl),
    );

    const pluginComponent = ui.default || ui;
    PluginUi.value = markRaw(createScopedPluginComponent(pluginComponent, pluginId.value));
    visible.value = true;
    error.value = null;
  } catch (err) {
    error.value = err.message;
  }
};

onMounted(() => {
  if (plugin.value) {
    mountPlugin();
  }
});

watch(plugin, (newVal) => {
  if (newVal && !visible.value) {
    mountPlugin();
  }
}, { immediate: true });

onUnmounted(() => {
  if (currentUiUrl) {
    URL.revokeObjectURL(currentUiUrl);
  }
});
</script>

<template>
  <div class="plugin-ui-loader w-full h-full min-h-screen" :data-plugin-id="pluginId">
    <template v-if="visible">
      <component :is="PluginUi" />
    </template>

    <div v-else-if="error" class="p-4 text-red-500">
      {{ error }}
    </div>
  </div>
</template>
