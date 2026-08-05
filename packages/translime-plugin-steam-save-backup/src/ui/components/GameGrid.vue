<template>
  <v-row>
    <v-col
      v-for="game in games"
      :key="game.appid"
      cols="12"
      sm="6"
      md="4"
      lg="3"
      xl="2"
    >
      <game-card
        :game="game"
        :exclude-loading="excludeLoading"
        @open="$emit('open-game', $event)"
        @exclude="$emit('exclude-game', $event)"
      />
    </v-col>
  </v-row>
</template>

<script setup>
import { useVuetifyComponents } from 'translime-sdk';
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

const vuetifyComponents = useVuetifyComponents();
const VCol = vuetifyComponents.VCol;
const VRow = vuetifyComponents.VRow;
</script>
