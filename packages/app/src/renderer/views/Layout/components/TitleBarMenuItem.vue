<script setup>
/**
 * 顶栏按钮区下拉菜单的递归项：分隔线、直项与带子菜单项共用。
 * 描述数据来自主进程 titleBarRegistry，点击叶子时上抛携带 id 的项。
 */
defineOptions({ name: 'TitleBarMenuItem' });

defineProps({
  item: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['select']);
</script>

<template>
  <mat-divider v-if="item.type === 'separator'" />
  <mat-menu-item
    v-else-if="item.children"
    :disabled="item.enabled === false"
    :tooltip="item.tooltip"
  >
    <template v-if="item.icon" #leading>
      <mat-icon
        :icon="item.icon"
        aria-hidden="true"
      />
    </template>
    {{ item.label }}
    <template #submenu>
      <mat-menu>
        <title-bar-menu-item
          v-for="child in item.children"
          :key="child.id || child.type"
          :item="child"
          @select="emit('select', $event)"
        />
      </mat-menu>
    </template>
  </mat-menu-item>
  <mat-menu-item
    v-else
    :disabled="item.enabled === false"
    :tooltip="item.tooltip"
    @click="emit('select', item)"
  >
    <template v-if="item.icon" #leading>
      <mat-icon
        :icon="item.icon"
        aria-hidden="true"
      />
    </template>
    {{ item.label }}
  </mat-menu-item>
</template>
