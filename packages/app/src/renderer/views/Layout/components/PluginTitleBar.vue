<script setup>
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useGlobalStore from '@/store/globalStore';

const emit = defineEmits(['inspect']);

const ipc = useIpc();
const store = useGlobalStore();
const props = defineProps({
  plugin: {
    type: Object,
    required: true,
  },
  visible: {
    type: Boolean,
    default: true,
  },
});

const showContextMenu = () => {
  ipc.send(ipcType.OPEN_PLUGIN_CONTEXT_MENU, props.plugin.packageName);
};
</script>

<template>
  <v-app-bar
    :scroll-behavior="props.visible ? 'inverted' : 'hide inverted'"
    density="compact"
    color="surface-container"
  >
    <template #prepend>
      <v-btn
        append-icon="expand_more"
        variant="text"
        rounded="0"
        height="100%"
        @click="showContextMenu"
      >
        {{ plugin.title }}
      </v-btn>
    </template>

    <template #append>
      <v-btn
        v-if="store.appSetting.showDevPlugin"
        size="small"
        color="primary"
        variant="tonal"
        @click="emit('inspect')"
      >
        <v-icon>bug_report</v-icon>
        Inspect
      </v-btn>
    </template>
  </v-app-bar>
</template>
