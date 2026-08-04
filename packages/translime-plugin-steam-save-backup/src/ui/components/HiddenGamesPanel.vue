<template>
  <v-row class="mt-8">
    <v-col cols="12">
      <v-expansion-panels variant="accordion">
        <v-expansion-panel
          elevation="0"
          class="bg-transparent"
        >
          <v-expansion-panel-title class="text-body-large text-[rgb(var(--v-theme-on-surface))] font-bold">
            <v-icon
              icon="visibility_off"
              class="mr-2"
            />
            已隐藏的游戏 ({{ games.length }} 个)
          </v-expansion-panel-title>

          <v-expansion-panel-text class="p-0">
            <v-row class="mt-2">
              <v-col
                v-for="game in games"
                :key="game.appid"
                cols="12"
                sm="6"
                md="4"
                lg="3"
                xl="2"
              >
                <v-card
                  variant="outlined"
                  density="compact"
                  style="opacity: .7"
                >
                  <v-card-text>
                    <div class="flex items-center">
                      <v-avatar
                        color="surface-container-highest"
                        size="40"
                      >
                        <span class="text-body-large font-bold">
                          {{ game.name.charAt(0).toUpperCase() }}
                        </span>
                      </v-avatar>

                      <div class="mx-2 overflow-hidden grow">
                        <div class="text-title-small truncate font-medium text-[rgb(var(--v-theme-on-surface-variant))]">
                          {{ game.name }}
                        </div>
                      </div>

                      <v-tooltip
                        text="恢复显示"
                        location="top"
                      >
                        <template #activator="{ props }">
                          <v-btn
                            v-bind="props"
                            icon="visibility"
                            variant="text"
                            size="x-small"
                            color="surface-container-highest"
                            :loading="excludeLoading === game.appid"
                            @click="$emit('include-game', game)"
                          />
                        </template>
                      </v-tooltip>
                    </div>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-col>
  </v-row>
</template>

<script setup>
import { useVuetifyComponents } from 'translime-sdk';

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

const vuetifyComponents = useVuetifyComponents();
const VAvatar = vuetifyComponents.VAvatar;
const VBtn = vuetifyComponents.VBtn;
const VCard = vuetifyComponents.VCard;
const VCardText = vuetifyComponents.VCardText;
const VCol = vuetifyComponents.VCol;
const VExpansionPanel = vuetifyComponents.VExpansionPanel;
const VExpansionPanels = vuetifyComponents.VExpansionPanels;
const VExpansionPanelText = vuetifyComponents.VExpansionPanelText;
const VExpansionPanelTitle = vuetifyComponents.VExpansionPanelTitle;
const VIcon = vuetifyComponents.VIcon;
const VRow = vuetifyComponents.VRow;
const VTooltip = vuetifyComponents.VTooltip;
</script>
