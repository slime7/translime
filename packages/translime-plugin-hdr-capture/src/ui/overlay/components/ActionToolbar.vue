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

const state = inject('state');
const { findDisplayAtLocalPoint } = inject('utils');

const toolbarPos = computed(() => {
  const {
    x, y, w, h,
  } = props.bounds;
  const tbWidth = 140;
  const tbHeight = 52;
  const spacing = 8;
  const margin = 12;

  // 找出选区中心所在的显示器
  const display = findDisplayAtLocalPoint(x + w / 2, y + h / 2);
  const db = display.bounds;

  // 显示器在本地坐标系下的边界
  const localDb = {
    left: db.x - state.offsetX,
    top: db.y - state.offsetY,
    right: db.x + db.width - state.offsetX,
    bottom: db.y + db.height - state.offsetY,
  };

  // 1. 尝试放在选区右下角外侧
  let left = x + w - tbWidth;
  let top = y + h + spacing;

  // 2. 检查下方是否超出该显示器边界
  if (top + tbHeight + margin > localDb.bottom) {
    // 3. 尝试放在选区右上角外侧
    top = y - tbHeight - spacing;

    // 4. 如果上方也放不下 (选区太高)
    if (top < localDb.top + margin) {
      // 5. 放在选区内部的右下角
      top = y + h - tbHeight - margin - 10;
      left = x + w - tbWidth - margin - 10;
    }
  }

  // 安全钳制：确保不超出该显示器
  left = Math.max(localDb.left + margin, Math.min(left, localDb.right - tbWidth - margin));
  top = Math.max(localDb.top + margin, Math.min(top, localDb.bottom - tbHeight - margin));

  return {
    left, top, tbWidth, tbHeight,
  };
});

const toolbarStyle = computed(() => ({
  left: `${toolbarPos.value.left}px`,
  top: `${toolbarPos.value.top}px`,
}));

// Debug 直线：从选区中心连向工具栏中心
const debugLine = computed(() => {
  if (!state.isDebug) return null;
  const {
    x, y, w, h,
  } = props.bounds;
  const {
    left, top, tbWidth, tbHeight,
  } = toolbarPos.value;
  return {
    x1: x + w / 2,
    y1: y + h / 2,
    x2: left + tbWidth / 2,
    y2: top + tbHeight / 2,
  };
});
</script>

<template>
  <Teleport to="body">
    <!-- Debug Line Layer -->
    <svg v-if="state && state.isDebug && debugLine" class="absolute inset-0 w-full h-full pointer-events-none z-99">
      <line
        :x1="debugLine.x1"
        :y1="debugLine.y1"
        :x2="debugLine.x2"
        :y2="debugLine.y2"
        stroke="#FF5252"
        stroke-width="2"
        stroke-dasharray="5,5"
      />
      <circle :cx="debugLine.x1" :cy="debugLine.y1" r="4" fill="#FF5252" />
      <text :x="debugLine.x2" :y="toolbarPos.top - 10" fill="#FF5252" font-size="12">
        {{ Math.round(toolbarPos.left) }}, {{ Math.round(toolbarPos.top) }}
      </text>
    </svg>

    <div
      v-if="state"
      class="absolute flex gap-2.5 p-2 bg-[#1e1e1e]/95 rounded-xl shadow-2xl backdrop-blur-md z-100 border border-white/10 pointer-events-auto"
      :style="toolbarStyle"
    >
      <div v-if="state.isDebug" class="absolute -top-6 left-0 text-[10px] text-[#FF5252] font-mono whitespace-nowrap">
        Monitor: {{ Math.round(toolbarPos.left) }},{{ Math.round(toolbarPos.top) }}
      </div>
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
  </teleport>
</template>
