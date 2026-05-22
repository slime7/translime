<template>
  <v-dialog
    v-model="visible"
    max-width="400px"
  >
    <v-card
      class="rounded-2xl"
      rounded
    >
      <v-toolbar
        color="primary"
        density="compact"
      >
        <v-toolbar-title>编辑备注</v-toolbar-title>

        <v-spacer />

        <v-btn
          icon
          @click="visible = false"
        >
          <v-icon>close</v-icon>
        </v-btn>
      </v-toolbar>

      <v-card-text class="p-4">
        <v-text-field
          v-model="noteValue"
          label="备份说明"
          placeholder="例如：打 BOSS 前、某个结局等"
          counter="80"
          maxlength="80"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          autofocus
          @keyup.enter="$emit('save')"
        />
      </v-card-text>

      <v-card-actions class="p-4 pt-0">
        <v-spacer />

        <v-btn
          variant="text"
          @click="visible = false"
        >
          取消
        </v-btn>

        <v-btn
          color="primary"
          variant="elevated"
          :loading="loading"
          @click="$emit('save')"
        >
          保存
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
  note: {
    type: String,
    default: '',
  },
  loading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue', 'update:note', 'save']);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const noteValue = computed({
  get: () => props.note,
  set: (value) => emit('update:note', value),
});

const vuetifyComponents = useVuetifyComponents();
const VBtn = vuetifyComponents.VBtn;
const VCard = vuetifyComponents.VCard;
const VCardActions = vuetifyComponents.VCardActions;
const VCardText = vuetifyComponents.VCardText;
const VDialog = vuetifyComponents.VDialog;
const VIcon = vuetifyComponents.VIcon;
const VSpacer = vuetifyComponents.VSpacer;
const VTextField = vuetifyComponents.VTextField;
const VToolbar = vuetifyComponents.VToolbar;
const VToolbarTitle = vuetifyComponents.VToolbarTitle;
</script>
