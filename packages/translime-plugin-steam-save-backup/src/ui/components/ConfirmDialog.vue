<template>
  <v-dialog
    v-model="visible"
    max-width="400px"
    persistent
  >
    <v-card
      class="rounded-2xl pa-2"
      rounded
    >
      <v-card-text class="text-center pt-6">
        <v-avatar
          :color="dialog.color"
          size="64"
          class="mb-4"
          variant="tonal"
        >
          <v-icon
            :icon="dialog.icon"
            size="32"
          />
        </v-avatar>

        <div class="text-xl font-bold mb-2">
          {{ dialog.title }}
        </div>

        <div class="text-body-medium text-[rgb(var(--v-theme-on-surface-variant))] mb-4">
          {{ dialog.message }}

          <div
            v-if="dialog.detail"
            class="mt-1 italic font-medium"
          >
            {{ dialog.detail }}
          </div>
        </div>
      </v-card-text>

      <v-card-actions class="p-4 pt-0">
        <v-spacer />

        <v-btn
          variant="text"
          color="grey"
          :disabled="dialog.loading"
          @click="visible = false"
        >
          取消
        </v-btn>

        <v-btn
          :color="dialog.color"
          variant="elevated"
          :loading="dialog.loading"
          @click="$emit('confirm')"
        >
          {{ dialog.confirmText }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { computed } from 'vue';
import { useVuetifyComponents } from 'translime-sdk';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  dialog: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['update:modelValue', 'confirm']);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const vuetifyComponents = useVuetifyComponents();
const VAvatar = vuetifyComponents.VAvatar;
const VBtn = vuetifyComponents.VBtn;
const VCard = vuetifyComponents.VCard;
const VCardActions = vuetifyComponents.VCardActions;
const VCardText = vuetifyComponents.VCardText;
const VDialog = vuetifyComponents.VDialog;
const VIcon = vuetifyComponents.VIcon;
const VSpacer = vuetifyComponents.VSpacer;
</script>
