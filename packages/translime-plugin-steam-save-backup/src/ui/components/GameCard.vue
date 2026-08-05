<template>
  <v-card
    class="rounded-2xl"
    rounded
    hover
    @click="$emit('open', game)"
  >
    <div class="mx-auto h-full flex flex-col">
      <div class="flex flex-row items-center p-4">
        <v-avatar
          color="primary"
          size="56"
        >
          <span class="text-2xl font-bold text-[rgb(var(--v-theme-on-primary))]">
            {{ game.name.charAt(0).toUpperCase() }}
          </span>
        </v-avatar>

        <div class="ml-4 truncate grow-1">
          <v-tooltip
            :text="game.name"
            location="top"
          >
            <template #activator="{ props }">
              <div
                v-bind="props"
                class="text-xl truncate font-medium"
              >
                {{ game.name }}
              </div>
            </template>
          </v-tooltip>

          <div class="text-[rgb(var(--v-theme-on-surface-variant))]">
            APP ID: {{ game.appid }}
          </div>
        </div>

        <v-tooltip
          text="隐藏此游戏"
          location="top"
        >
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              icon="visibility_off"
              variant="text"
              size="small"
              color="on-surface-variant"
              :loading="excludeLoading === game.appid"
              @click.stop="$emit('exclude', game)"
            />
          </template>
        </v-tooltip>
      </div>

      <v-divider />
    </div>

    <v-card-text>
      <div class="py-2">
        <div class="flex justify-between items-center">
          <v-chip
            size="small"
            :color="game.backupCount > 0 ? 'tertiary' : 'surface-container-highest'"
            variant="flat"
            class="font-medium"
          >
            {{ game.backupCount || 0 }} 个备份
          </v-chip>

          <v-icon
            color="outline"
            icon="chevron_right"
          />
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { useVuetifyComponents } from 'translime-sdk';

defineProps({
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

const vuetifyComponents = useVuetifyComponents();
const VAvatar = vuetifyComponents.VAvatar;
const VBtn = vuetifyComponents.VBtn;
const VCard = vuetifyComponents.VCard;
const VCardText = vuetifyComponents.VCardText;
const VChip = vuetifyComponents.VChip;
const VDivider = vuetifyComponents.VDivider;
const VIcon = vuetifyComponents.VIcon;
const VTooltip = vuetifyComponents.VTooltip;
</script>
