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
  <div
    v-show="props.visible"
    class="flex-none flex items-center h-12 bg-surface-container text-on-surface"
  >
    <mat-btn
      variant="text"
      shape="square"
      class="h-full"
      suffix="expand_more"
      @click="showContextMenu"
    >
      {{ plugin.title }}
    </mat-btn>

    <div class="grow" />

    <mat-btn
      v-if="store.appSetting.showDevPlugin"
      variant="filled-tonal"
      color="primary"
      prefix="bug_report"
      class="mr-2"
      @click="emit('inspect')"
    >
      Inspect
    </mat-btn>
  </div>
</template>
