<template>
  <div class="mt-8">
    <mat-expansion-panel
      :split="false"
      :title="`已隐藏的游戏 (${games.length} 个)`"
    >
      <div class="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <mat-card
          v-for="game in games"
          :key="game.appid"
          variant="outlined"
          class="hidden-game-card"
        >
          <mat-card-content>
            <div class="flex items-center">
              <mat-avatar
                :size="40"
                color="surface-container-highest"
              >
                <span class="font-bold">{{ game.name.charAt(0).toUpperCase() }}</span>
              </mat-avatar>

              <div class="mx-2 overflow-hidden grow">
                <div class="hidden-game-name truncate font-medium">
                  {{ game.name }}
                </div>
              </div>

              <mat-tooltip
                content="恢复显示"
                location="top"
              >
                <template #activator>
                  <mat-btn
                    icon="visibility"
                    variant="standard"
                    size="small"
                    :loading="excludeLoading === game.appid"
                    :aria-label="`恢复显示游戏 ${game.name}`"
                    @click="$emit('include-game', game)"
                  />
                </template>
              </mat-tooltip>
            </div>
          </mat-card-content>
        </mat-card>
      </div>
    </mat-expansion-panel>
  </div>
</template>

<script setup>
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

defineEmits(['include-game']);
</script>

<style scoped>
.hidden-game-card {
  opacity: .7;
}

.hidden-game-name {
  color: var(--mat-sys-color-on-surface-variant);
  font-size: .875rem;
}
</style>
