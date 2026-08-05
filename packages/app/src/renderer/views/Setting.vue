<template>
  <v-container class="setting">
    <div class="text-center text-5xl">
      设置
    </div>

    <div class="mt-4 columns-1 lg:columns-2 gap-4 mx-auto max-w-204">
      <general-settings-section />
      <registry-settings-section />
      <appearance-settings-section />
    </div>
  </v-container>
</template>

<script setup>
import GeneralSettingsSection from '@/components/settings/GeneralSettingsSection.vue';
import RegistrySettingsSection from '@/components/settings/RegistrySettingsSection.vue';
import AppearanceSettingsSection from '@/components/settings/AppearanceSettingsSection.vue';
</script>
