<template>
  <mat-menu
    :model-value="menu.open"
    :anchor="menu.anchor"
    @update:model-value="menu.close()"
  >
    <template
      v-for="(item, index) in menu.items"
      :key="item.id ?? `separator-${index}`"
    >
      <mat-divider v-if="item.type === 'separator'" />
      <mat-menu-item
        v-else
        :disabled="item.enabled === false"
        @click="menu.select(item)"
      >
        {{ item.label }}
        <template v-if="item.checked" #trailing>
          <mat-icon icon="check" aria-hidden="true" />
        </template>
        <template v-else-if="item.shortcut" #trailing>
          {{ item.shortcut }}
        </template>
      </mat-menu-item>
    </template>
  </mat-menu>
</template>

<script setup>
import useMenuStore from '@/store/menuStore';

const menu = useMenuStore();
</script>
