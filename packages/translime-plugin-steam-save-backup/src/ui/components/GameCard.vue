<template>
  <mat-card
    class="game-card"
    variant="elevated"
    @click="$emit('open', game)"
  >
    <div class="flex flex-row items-center p-4">
      <mat-avatar
        :size="56"
        color="primary"
      >
        <span class="text-2xl font-bold">{{ game.name.charAt(0).toUpperCase() }}</span>
      </mat-avatar>

      <div class="ml-4 truncate grow">
        <mat-tooltip
          :content="game.name"
          location="top"
        >
          <template #activator>
            <div class="game-title truncate text-xl font-medium">
              {{ game.name }}
            </div>
          </template>
        </mat-tooltip>

        <div
          v-if="game.uninstalled"
          class="game-subtitle"
        >
          未安装 · 仅存档管理
        </div>
        <div
          v-else-if="game.isCustom"
          class="game-subtitle"
        >
          自定义游戏
        </div>
        <div
          v-else
          class="game-subtitle"
        >
          APP ID: {{ game.appid }}
        </div>
      </div>

      <mat-tooltip
        content="隐藏此游戏"
        location="top"
      >
        <template #activator>
          <mat-btn
            icon="visibility_off"
            variant="standard"
            size="small"
            :loading="excludeLoading === game.appid"
            :aria-label="`隐藏游戏 ${game.name}`"
            @click.stop="$emit('exclude', game)"
          />
        </template>
      </mat-tooltip>
    </div>

    <mat-divider />

    <mat-card-content>
      <div class="py-2">
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-2">
            <mat-chip
              variant="assist"
              :color="game.backupCount > 0 ? 'tertiary' : undefined"
              class="font-medium"
            >
              {{ game.backupCount || 0 }} 个备份
            </mat-chip>

            <mat-tooltip
              v-if="syncState"
              :content="syncState.detail || syncState.label"
              location="top"
            >
              <template #activator>
                <mat-chip
                  variant="assist"
                  :color="syncChipColor"
                >
                  <template #leading>
                    <mat-icon
                      :icon="syncState.icon"
                      size="18px"
                      :class="{ 'sync-spinning': syncState.key === 'syncing' }"
                    />
                  </template>
                  {{ syncState.label }}
                </mat-chip>
              </template>
            </mat-tooltip>
          </div>

          <mat-icon
            icon="chevron_right"
            class="card-chevron"
          />
        </div>
      </div>
    </mat-card-content>
  </mat-card>
</template>

<script setup>
import { computed } from 'vue';
import { gameSyncState } from '../composables/useSyncStatus';

const props = defineProps({
  game: {
    type: Object,
    required: true,
  },
  excludeLoading: {
    type: [String, Number, null],
    default: null,
  },
});

defineEmits(['open', 'exclude']);

const syncState = computed(() => gameSyncState(props.game.appid));
const syncChipColor = computed(() => {
  if (syncState.value?.key === 'conflict') {
    return 'error';
  }
  if (syncState.value?.key === 'pending') {
    return 'secondary';
  }
  if (syncState.value?.key === 'synced') {
    return 'tertiary';
  }
  return undefined;
});
</script>

<style scoped>
.game-card {
  cursor: pointer;
  transition: box-shadow .2s ease;
}

.game-card:hover {
  box-shadow: 0 4px 12px rgb(0 0 0 / 18%);
}

.game-title {
  color: var(--mat-sys-color-on-surface);
}

.game-subtitle {
  color: var(--mat-sys-color-on-surface-variant);
}

.card-chevron {
  color: var(--mat-sys-color-outline);
}

/* 同步进行中的图标旋转；名称带插件前缀避免污染全局命名空间 */
@keyframes steam-save-sync-spin {
  to {
    transform: rotate(360deg);
  }
}

.sync-spinning {
  animation: steam-save-sync-spin 1.5s linear infinite;
}
</style>
