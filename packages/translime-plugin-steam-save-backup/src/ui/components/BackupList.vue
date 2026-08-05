<template>
  <div
    v-if="backups.length > 0"
    class="p-4"
  >
    <v-card
      v-for="backup in backups"
      :key="backup.id"
      class="mb-3"
      elevation="1"
      border
    >
      <v-list-item class="p-3">
        <template #prepend>
          <v-avatar color="secondary-container">
            <v-icon
              icon="save"
              color="on-secondary-container"
            />
          </v-avatar>
        </template>

        <v-list-item-title class="font-bold">
          {{ formatTime(backup.backupTime) }}
        </v-list-item-title>

        <v-list-item-subtitle
          v-if="backup.note"
          class="mt-1 text-primary text-sm italic"
        >
          “{{ backup.note }}”
        </v-list-item-subtitle>

        <template #append>
          <div class="flex items-center gap-2">
            <v-tooltip
              text="还原此备份"
              location="top"
            >
              <template #activator="{ props }">
                <v-btn
                  v-bind="props"
                  variant="elevated"
                  color="primary"
                  size="small"
                  prepend-icon="settings_backup_restore"
                  class="mr-2"
                  :loading="loading.restore === backup.id"
                  @click="$emit('restore', backup)"
                >
                  还原
                </v-btn>
              </template>
            </v-tooltip>

            <v-tooltip
              text="备注"
              location="top"
            >
              <template #activator="{ props }">
                <v-btn
                  v-bind="props"
                  variant="text"
                  color="on-surface-variant"
                  icon="edit_note"
                  size="small"
                  @click="$emit('edit-note', backup)"
                />
              </template>
            </v-tooltip>

            <v-tooltip
              text="删除备份"
              location="top"
            >
              <template #activator="{ props }">
                <v-btn
                  v-bind="props"
                  variant="text"
                  color="error"
                  icon="delete"
                  size="small"
                  :loading="loading.delete === backup.id"
                  @click="$emit('delete', backup)"
                />
              </template>
            </v-tooltip>
          </div>
        </template>
      </v-list-item>
    </v-card>
  </div>

  <div
    v-else
    class="flex flex-col items-center justify-center h-full w-full py-10 text-[rgb(var(--v-theme-on-surface-variant))]"
  >
    <v-icon
      size="64"
      color="outline-variant"
    >
      inventory_2
    </v-icon>

    <div class="mt-2">
      暂无备份记录
    </div>
  </div>
</template>

<script setup>
import { useVuetifyComponents } from 'translime-sdk';

defineProps({
  backups: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Object,
    required: true,
  },
  formatTime: {
    type: Function,
    required: true,
  },
});

defineEmits(['restore', 'edit-note', 'delete']);

const vuetifyComponents = useVuetifyComponents();
const VAvatar = vuetifyComponents.VAvatar;
const VBtn = vuetifyComponents.VBtn;
const VCard = vuetifyComponents.VCard;
const VIcon = vuetifyComponents.VIcon;
const VListItem = vuetifyComponents.VListItem;
const VListItemSubtitle = vuetifyComponents.VListItemSubtitle;
const VListItemTitle = vuetifyComponents.VListItemTitle;
const VTooltip = vuetifyComponents.VTooltip;
</script>
