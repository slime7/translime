<script setup>
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';

const ipc = useIpc();
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
  >
    <template v-slot:prepend>
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
  </v-app-bar>
</template>
