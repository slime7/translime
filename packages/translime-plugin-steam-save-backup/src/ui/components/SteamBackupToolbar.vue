<template>
  <v-toolbar
    density="compact"
    color="transparent"
    class="mb-4"
  >
    <v-toolbar-title class="text-2xl font-bold text-primary">
      Steam 存档备份
    </v-toolbar-title>

    <v-spacer />

    <v-btn
      prepend-icon="folder_open"
      variant="tonal"
      color="secondary"
      class="mr-2"
      :loading="openDirLoading"
      @click="$emit('open-backup-dir')"
    >
      打开备份目录
    </v-btn>

    <v-btn
      prepend-icon="refresh"
      variant="tonal"
      color="primary"
      :loading="scanLoading"
      @click="$emit('scan-games')"
    >
      刷新列表
    </v-btn>
  </v-toolbar>
</template>

<script setup>
import { useVuetifyComponents } from 'translime-sdk';

defineProps({
  openDirLoading: {
    type: Boolean,
    default: false,
  },
  scanLoading: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['open-backup-dir', 'scan-games']);

const vuetifyComponents = useVuetifyComponents();
const VBtn = vuetifyComponents.VBtn;
const VSpacer = vuetifyComponents.VSpacer;
const VToolbar = vuetifyComponents.VToolbar;
const VToolbarTitle = vuetifyComponents.VToolbarTitle;
</script>
