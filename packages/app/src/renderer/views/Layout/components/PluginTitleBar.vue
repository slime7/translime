<script setup>
import useMenuStore from '@/store/menuStore';
import useGlobalStore from '@/store/globalStore';

const emit = defineEmits(['inspect']);

const menu = useMenuStore();
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

const showContextMenu = (event) => {
  menu.openPluginMenu(props.plugin.packageName, event);
};
</script>

<template>
  <div
    v-show="props.visible"
    data-test="plugin-title-bar"
    class="flex-none flex items-center h-12 bg-surface-container-low text-on-surface"
  >
    <mat-btn
      :id="`plugin-title-menu-${props.plugin.packageName}`"
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
