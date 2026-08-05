<template>
  <v-row>
    <v-col
      cols="12"
      class="text-center mt-10"
    >
      <v-progress-circular
        indeterminate
        color="primary"
        size="64"
      />

      <div class="mt-4 text-[rgb(var(--v-theme-on-surface-variant))]">
        正在扫描 Steam 游戏...
      </div>
    </v-col>
  </v-row>
</template>

<script setup>
import { useVuetifyComponents } from 'translime-sdk';

const vuetifyComponents = useVuetifyComponents();
const VCol = vuetifyComponents.VCol;
const VProgressCircular = vuetifyComponents.VProgressCircular;
const VRow = vuetifyComponents.VRow;
</script>
