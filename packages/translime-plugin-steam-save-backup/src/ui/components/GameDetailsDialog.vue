<template>
  <v-dialog
    v-model="visible"
    max-width="800px"
    scrollable
    transition="dialog-bottom-transition"
  >
    <v-card
      v-if="selectedGame"
      class="rounded-2xl"
      rounded
      height="80vh"
    >
      <v-toolbar
        color="primary"
        density="compact"
        class="grow-0"
      >
        <v-toolbar-title>
          ({{ selectedGame.appid }}){{ selectedGame.name }} - 备份管理
        </v-toolbar-title>

        <template #append>
          <div class="flex gap-1">
            <v-btn
              icon
              @click="visible = false"
            >
              <v-icon>close</v-icon>
            </v-btn>
          </div>
        </template>
      </v-toolbar>

      <v-card-text class="p-0 grow-1 overflow-y-auto">
        <save-paths-panel :game="selectedGame" />

        <v-alert
          v-if="!canBackup"
          color="tertiary-container"
          variant="tonal"
          class="m-4"
          icon="warning"
        >
          <span class="text-[rgb(var(--v-theme-on-tertiary-container))]">
            无法自动定位该游戏的存档路径，暂不支持备份。
          </span>
        </v-alert>

        <backup-list
          :backups="backups"
          :loading="loading"
          :format-time="formatTime"
          @restore="$emit('restore', $event)"
          @edit-note="$emit('edit-note', $event)"
          @delete="$emit('delete', $event)"
        />
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-spacer />

        <v-btn
          variant="text"
          @click="visible = false"
        >
          关闭
        </v-btn>

        <v-btn
          color="primary"
          prepend-icon="cloud_upload"
          variant="elevated"
          :loading="loading.backup"
          :disabled="!canBackup"
          @click="$emit('backup')"
        >
          立即备份
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { computed } from 'vue';
import { useVuetifyComponents } from 'translime-sdk';
import BackupList from './BackupList.vue';
import SavePathsPanel from './SavePathsPanel.vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  selectedGame: {
    type: Object,
    default: null,
  },
  backups: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Object,
    required: true,
  },
  canBackup: {
    type: Boolean,
    default: false,
  },
  formatTime: {
    type: Function,
    required: true,
  },
});

const emit = defineEmits([
  'update:modelValue',
  'backup',
  'restore',
  'delete',
  'edit-note',
]);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const vuetifyComponents = useVuetifyComponents();
const VAlert = vuetifyComponents.VAlert;
const VBtn = vuetifyComponents.VBtn;
const VCard = vuetifyComponents.VCard;
const VCardActions = vuetifyComponents.VCardActions;
const VCardText = vuetifyComponents.VCardText;
const VDialog = vuetifyComponents.VDialog;
const VDivider = vuetifyComponents.VDivider;
const VIcon = vuetifyComponents.VIcon;
const VSpacer = vuetifyComponents.VSpacer;
const VToolbar = vuetifyComponents.VToolbar;
const VToolbarTitle = vuetifyComponents.VToolbarTitle;
</script>
