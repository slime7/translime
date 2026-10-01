<template>
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
    <GameCard
      v-for="game in games"
      :key="game.appid"
      :game="game"
      :exclude-loading="excludeLoading"
      @open="$emit('open-game', $event)"
      @exclude="$emit('exclude-game', $event)"
    />
  </div>
</template>

<script setup>
import GameCard from './GameCard.vue';

defineProps({
  games: {
    type: Array,
    default: () => [],
  },
  excludeLoading: {
    type: [String, Number, null],
    default: null,
  },
});

defineEmits(['open-game', 'exclude-game']);
</script>
