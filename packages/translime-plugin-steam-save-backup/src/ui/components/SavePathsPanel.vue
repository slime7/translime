<template>
  <v-expansion-panels
    v-if="savePaths.length"
    variant="accordion"
    class="mb-2"
  >
    <v-expansion-panel elevation="0">
      <v-expansion-panel-title class="text-subtitle-2 text-[rgb(var(--v-theme-on-surface-variant))]">
        <v-icon
          icon="folder_open"
          size="small"
          class="mr-2"
        />
        检测到存档路径 ({{ savePaths.length }} 个)
      </v-expansion-panel-title>

      <v-expansion-panel-text>
        <div
          v-for="(pathInfo, index) in savePaths"
          :key="`${pathInfo.absolutePath || 'unknown'}-${index}`"
          class="text-sm mb-4 break-all"
        >
          <div class="font-bold mb-1 flex items-center">
            <v-chip
              size="x-small"
              label
              class="mr-2"
              color="primary"
              variant="tonal"
            >
              路径 {{ index + 1 }}
            </v-chip>

            <span class="text-[rgb(var(--v-theme-on-surface))]">
              {{ pathInfo.absolutePath || '未探测到有效路径' }}
            </span>
          </div>

          <div class="ml-4 pl-3 border-s border-opacity-25">
            <div
              v-for="file in pathInfo.files"
              :key="file"
              class="text-[rgb(var(--v-theme-on-surface-variant))] flex items-center py-0.5"
            >
              <v-icon
                icon="description"
                size="14"
                class="mr-1 text-[rgb(var(--v-theme-outline))]"
              />
              {{ file }}
            </div>
          </div>
        </div>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<script setup>
import { computed } from 'vue';
import { useVuetifyComponents } from 'translime-sdk';
import { normalizeSaveSource } from '../../utils/save-sources';

const props = defineProps({
  game: {
    type: Object,
    default: null,
  },
});

const savePaths = computed(() => {
  if (Array.isArray(props.game?.saveSources)) {
    return props.game.saveSources.map((source, index) => {
      const normalizedSource = normalizeSaveSource(source, index);
      return {
        absolutePath: normalizedSource.absolutePath,
        relativePath: normalizedSource.relativePath,
        files: normalizedSource.files,
      };
    });
  }

  return props.game?.savePaths || [];
});

const vuetifyComponents = useVuetifyComponents();
const VChip = vuetifyComponents.VChip;
const VExpansionPanel = vuetifyComponents.VExpansionPanel;
const VExpansionPanels = vuetifyComponents.VExpansionPanels;
const VExpansionPanelText = vuetifyComponents.VExpansionPanelText;
const VExpansionPanelTitle = vuetifyComponents.VExpansionPanelTitle;
const VIcon = vuetifyComponents.VIcon;
</script>
