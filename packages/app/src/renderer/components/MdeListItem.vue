<script setup>
defineProps({
  itemType: {
    type: String,
    default: 'text',
  },
  isActive: {
    type: Boolean,
    default: undefined,
  },
  selected: {
    type: String,
    default: '',
  },
});
</script>

<template>
  <v-list-item
    v-if="itemType === 'text'"
    class="mde-list-item ease-decelerate"
    density="comfortable"
    rounded
    link
    active
  />

  <v-list-item
    v-else-if="itemType === 'switch'"
    class="mde-list-item ease-decelerate"
    density="comfortable"
    base-color="primary"
    rounded
    link
    active
  >
    <template #append>
      <v-switch
        :model-value="isActive"
        color="primary"
        density="compact"
        hide-details
        readonly
      />
    </template>
  </v-list-item>

  <v-list-item
    v-else-if="itemType === 'radio'"
    class="mde-list-item ease-decelerate"
    :class="[isActive ? 'rounded-[16px]' : 'rounded-[4px]']"
    density="comfortable"
    rounded
    link
    :base-color="isActive ? 'secondary' : 'primary'"
    active
  >
    <template #append>
      <v-radio
        :model-value="isActive"
        color="primary"
        density="compact"
        hide-details
        readonly
      />
    </template>
  </v-list-item>

  <v-list-item
    v-else-if="itemType === 'select'"
    class="mde-list-item ease-decelerate"
    density="comfortable"
    rounded
    link
    base-color="primary"
    active
  >
    <template #append>
      <div>{{ selected }}</div>
    </template>
  </v-list-item>
</template>

<style scoped>
.mde-list-item {
  transition-property: all;
}

.mde-list-item + .mde-list-item {
  margin-top: .125rem;
}
</style>
