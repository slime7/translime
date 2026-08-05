<template>
  <div class="flex flex-col items-center justify-center w-full mt-10">
    <v-icon
      size="80"
      color="outline-variant"
    >
      sports_esports
    </v-icon>

    <div class="text-xl text-[rgb(var(--v-theme-on-surface-variant))] mt-4">
      未发现 Steam 游戏
    </div>

    <div class="text-sm text-[rgb(var(--v-theme-outline))] mt-1">
      请尝试在插件设置中手动配置 Steam 路径
    </div>

    <v-btn
      class="mt-4"
      color="primary"
      variant="text"
      @click="$emit('scan')"
    >
      重新扫描
    </v-btn>
  </div>
</template>

<script setup>
import { useVuetifyComponents } from 'translime-sdk';

defineEmits(['scan']);

const vuetifyComponents = useVuetifyComponents();
const VBtn = vuetifyComponents.VBtn;
const VIcon = vuetifyComponents.VIcon;
</script>
