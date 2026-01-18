<template>
  <v-card
    class="mde-list rounded-[16px]"
    rounded
    variant="flat"
    color="transparent"
  >
    <v-list
      class="py-0"
      indent="4"
      bg-color="transparent"
    >
      <slot />
    </v-list>
  </v-card>
</template>
