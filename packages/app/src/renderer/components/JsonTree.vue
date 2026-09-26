<template>
  <ul class="json-tree">
    <li
      v-for="item in items"
      :key="item.value"
    >
      <div
        v-if="hasChildren(item)"
        class="json-tree__row json-tree__row--branch"
        role="treeitem"
        :aria-expanded="isOpen(item)"
        tabindex="0"
        @click="toggle(item)"
        @keydown.enter="toggle(item)"
        @keydown.space.prevent="toggle(item)"
      >
        <mat-icon class="json-tree__chevron" aria-hidden="true">
          {{ isOpen(item) ? 'expand_more' : 'chevron_right' }}
        </mat-icon>
        <span class="json-tree__label">{{ item.label }}</span>
        <span class="json-tree__colon">:</span>
        <span
          v-if="item.valueText"
          class="json-tree__value"
        >{{ item.valueText }}</span>
      </div>

      <div
        v-else
        class="json-tree__row"
      >
        <span class="json-tree__chevron" />
        <span class="json-tree__label">{{ item.label }}</span>
        <span class="json-tree__colon">:</span>
        <span
          v-if="item.valueText"
          class="json-tree__value"
        >{{ item.valueText }}</span>
      </div>

      <json-tree
        v-if="hasChildren(item) && isOpen(item) && nodeChildren(item).length"
        :items="nodeChildren(item)"
        :opened="opened"
        :load-children="loadChildren"
        class="json-tree__children"
      />
    </li>
  </ul>
</template>

<script setup>
const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  opened: {
    type: Array,
    default: () => [],
  },
  loadChildren: {
    type: Function,
    default: null,
  },
});

const emit = defineEmits(['update:opened']);

const hasChildren = (item) => Array.isArray(item.children);

const nodeChildren = (item) => (item.childrenLoaded ? item.children : []);

const isOpen = (item) => props.opened.includes(item.value);

const toggle = async (item) => {
  if (!hasChildren(item)) {
    return;
  }
  if (isOpen(item)) {
    emit('update:opened', props.opened.filter((value) => value !== item.value));
    return;
  }
  if (!item.childrenLoaded && props.loadChildren) {
    await props.loadChildren(item);
  }
  emit('update:opened', [...props.opened, item.value]);
};
</script>

<script>
export default {
  name: 'JsonTree',
};
</script>

<style scoped>
.json-tree {
  margin: 0;
  padding: 0;
  list-style: none;
}

.json-tree__children {
  padding-left: 1.25rem;
}

.json-tree__row {
  display: grid;
  grid-template-columns: max-content max-content max-content minmax(0, 1fr);
  align-items: start;
  column-gap: .375rem;
  width: 100%;
  min-height: 1.75rem;
  border-radius: 8px;
}

.json-tree__row--branch {
  cursor: default;
}

.json-tree__chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 1.25rem;
  font-size: 1rem;
  color: var(--mat-sys-color-on-surface-variant);
}

.json-tree__label {
  font-weight: 500;
}

.json-tree__colon {
  margin-inline: -.125rem;
  color: var(--mat-sys-color-on-surface-variant);
}

.json-tree__value {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--mat-sys-color-on-surface-variant);
}
</style>
