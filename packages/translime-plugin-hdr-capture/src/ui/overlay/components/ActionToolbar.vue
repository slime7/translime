<script setup>
import { computed, inject } from 'vue';

const props = defineProps({
  bounds: {
    type: Object,
    default: () => ({
      x: 0, y: 0, w: 0, h: 0,
    }),
  },
});

const { handleAction } = inject('actions');

const toolbarStyle = computed(() => {
  const {
    x, y, w, h,
  } = props.bounds;
  const tbWidth = 140; // 预估宽度

  let top = y + h + 12;
  // 空间不足向上放
  if (top + 50 > window.innerHeight) {
    top = y - 56;
  }

  return {
    left: `${x + (w - tbWidth) / 2}px`,
    top: `${top}px`,
  };
});
</script>

<template>
  <div
    class="absolute flex gap-2.5 p-2 bg-[#1e1e1e]/95 rounded-xl shadow-2xl backdrop-blur-md z-100 border border-white/10 pointer-events-auto"
    :style="toolbarStyle"
  >
    <button
      class="w-9 h-9 border-none rounded-lg cursor-pointer flex items-center justify-center text-lg transition-all duration-200 hover:scale-115 hover:-translate-y-0.5 active:scale-95 bg-[#4CAF50] text-white hover:shadow-[0_0_15px_rgba(76,175,80,0.5)]"
      title="保存"
      @click.stop="handleAction('save')"
    >
      💾
    </button>
    <button
      class="w-9 h-9 border-none rounded-lg cursor-pointer flex items-center justify-center text-lg transition-all duration-200 hover:scale-115 hover:-translate-y-0.5 active:scale-95 bg-[#2196F3] text-white hover:shadow-[0_0_15px_rgba(33,150,243,0.5)]"
      title="复制"
      @click.stop="handleAction('copy')"
    >
      📋
    </button>
    <button
      class="w-9 h-9 border-none rounded-lg cursor-pointer flex items-center justify-center text-lg transition-all duration-200 hover:scale-115 hover:-translate-y-0.5 active:scale-95 bg-[#F44336] text-white hover:shadow-[0_0_15px_rgba(244,67,54,0.5)]"
      title="取消"
      @click.stop="handleAction('cancel')"
    >
      ✕
    </button>
  </div>
</template>
