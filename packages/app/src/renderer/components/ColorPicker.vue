<script setup>
import { computed, ref } from 'vue';

const model = defineModel();
const props = defineProps({
  rounded: {
    type: Boolean,
    default: false,
  },
  alpha: {
    type: Boolean,
    default: false,
  },
  size: {
    type: String,
    default: 'normal',
  },
});

const sizeClass = computed(() => ({
  normal: 'w-12 h-12',
  small: 'w-8 h-8',
  large: 'w-16 h-16',
}[props.size]));

const tempColor = ref(model.value);
const dialogVisible = ref(false);
const openDialog = () => {
  tempColor.value = model.value;
  dialogVisible.value = true;
};
const setColorDialogCancel = () => {
  dialogVisible.value = false;
};
const setColorDialogConfirm = () => {
  model.value = tempColor.value;
  dialogVisible.value = false;
};
</script>

<template>
  <div class="color-picker">
    <div
      class="cursor-pointer border-2"
      :class="[ sizeClass, { 'rounded-full': rounded }]"
      :style="{ 'background-color': model, 'border-color': 'rgb(var(--v-theme-outline)' }"
      @click="openDialog"
    />

    <v-dialog
      v-model="dialogVisible"
      scrollable
      max-width="364px"
    >
      <v-card color="surface-container-high">
        <v-card-title>颜色选择器</v-card-title>

        <v-card-text>
          <div>
            <v-color-picker
              v-model="tempColor"
              bg-color="surface-container-high"
              elevation="0"
              mode="hex"
              :modes="['hex', 'hsl', 'rgb', ...(alpha ? ['hexa', 'hsla', 'rgba'] : [])]"
              hide-eye-dropper
              tile
            />
          </div>
        </v-card-text>

        <v-card-actions>
          <v-spacer />

          <v-btn
            color="primary"
            @click="setColorDialogCancel"
          >
            取消
          </v-btn>

          <v-btn
            color="primary"
            variant="elevated"
            @click="setColorDialogConfirm"
          >
            确认
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
