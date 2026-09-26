<template>
  <div
    v-bind="attrs"
    class="rounded-2xl border border-outline select-none"
  >
    <div class="relative p-4">
      <div class="flex flex-col items-center">
        <div class="flex">
          <div
            v-for="(color, index) in colors"
            :key="`${title}-${color}-${index}`"
            class="rounded-full w-12 h-12 border-2 border-surface-container-high"
            :class="index > 0 ? '-ml-4' : ''"
            :style="{
              'background-color': color,
              'z-index': colors.length - index,
            }"
          />
        </div>

        <div class="mt-2 text-primary">
          {{ title }}
        </div>
      </div>

      <div
        v-if="selected"
        class="absolute inset-0 flex items-center justify-center z-5"
      >
        <div
          class="w-12 h-12 border-2 border-surface-container-high
            bg-primary-container rounded-full flex items-center justify-center"
        >
          <mat-icon class="text-on-primary-container">
            check
          </mat-icon>
        </div>
      </div>
    </div>
  </div>
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
