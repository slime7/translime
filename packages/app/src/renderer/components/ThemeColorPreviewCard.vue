<template>
  <v-card
    v-bind="attrs"
    class="rounded-2xl"
    link
    variant="outlined"
    rounded
  >
    <v-card-text class="relative">
      <div class="flex flex-col items-center">
        <div class="flex">
          <div
            v-for="(color, index) in colors"
            :key="`${title}-${color}-${index}`"
            class="rounded-full w-12 h-12 border-2 border-[rgb(var(--v-theme-surface-container-high))]"
            :class="index > 0 ? '-ml-4' : ''"
            :style="{
              'background-color': color,
              'z-index': colors.length - index,
            }"
          />
        </div>

        <div class="mt-2 text-primary select-none">
          {{ title }}
        </div>
      </div>

      <div
        v-if="selected"
        class="absolute inset-0 flex items-center justify-center z-5"
      >
        <div
          class="w-12 h-12 border-2 border-[rgb(var(--v-theme-surface-container-high))]
            bg-[rgb(var(--v-theme-primary-container))] rounded-full flex items-center justify-center"
        >
          <v-icon class="text-[rgb(var(--v-theme-on-primary-container))]">
            check
          </v-icon>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { useAttrs } from 'vue';

defineProps({
  title: {
    type: String,
    required: true,
  },
  colors: {
    type: Array,
    required: true,
  },
  selected: {
    type: Boolean,
    default: false,
  },
});

const attrs = useAttrs();
</script>
