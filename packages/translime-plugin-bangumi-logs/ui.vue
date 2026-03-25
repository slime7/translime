<template>
  <BangumiLogsApp />
</template>

<script setup>
import BangumiLogsApp from './src/ui/App.vue';
</script>

<style>
/* 引入 Tailwind CSS utilities，放入 tailwind 图层以与主程序统一 */
@layer tailwind {
  @layer theme, utilities;
  @import "tailwindcss/theme.css" layer(theme);
  @import "tailwindcss/utilities.css" layer(utilities);
}
</style>
