<script setup>
import { computed, inject, ref } from 'vue';

const props = defineProps({
  cursorPos: {
    type: Object,
    default: () => ({ x: 0, y: 0 }),
  },
});

const { findDisplayAtLocalPoint } = inject('utils');
const side = ref('right'); // 'right' | 'left'

const onMouseEnter = () => {
  side.value = side.value === 'right' ? 'left' : 'right';
};

const hintStyle = computed(() => {
  const display = findDisplayAtLocalPoint(props.cursorPos.x, props.cursorPos.y);
  if (!display) return { display: 'none' };

  const state = inject('state');
  const b = display.bounds;
  const localBounds = {
    left: b.x - state.offsetX,
    top: b.y - state.offsetY,
    right: b.x + b.width - state.offsetX,
    bottom: b.y + b.height - state.offsetY,
  };

  const margin = 20;
  const style = {
    bottom: `${window.innerHeight - localBounds.bottom + margin}px`,
  };

  if (side.value === 'right') {
    style.right = `${window.innerWidth - localBounds.right + margin}px`;
  } else {
    style.left = `${localBounds.left + margin}px`;
  }

  return style;
});
</script>

<template>
  <div
    class="absolute z-50 pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
    :style="hintStyle"
    @mouseenter="onMouseEnter"
  >
    <div class="bg-black/75 text-white px-4 py-2 rounded-xl text-[13px] backdrop-blur-xs border border-white/10 shadow-lg">
      点击探测到的窗口，或拖拽选择 · 拖放移动选区 · 右键取消
    </div>
  </div>
</template>
