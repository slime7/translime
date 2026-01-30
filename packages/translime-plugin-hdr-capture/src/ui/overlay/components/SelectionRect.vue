<script setup>
import { computed, ref, watchEffect } from 'vue';

const props = defineProps({
  state: {
    type: Object,
    default: () => ({
      isSelecting: false, hasSelection: false, highlightedWindow: null, offsetX: 0, offsetY: 0,
    }),
  },
  bounds: {
    type: Object,
    default: () => ({
      x: 0, y: 0, w: 0, h: 0,
    }),
  },
});

const canvasRef = ref(null);

// 绘制遮罩逻辑
watchEffect(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // 这里必须要同步窗口大小，因为是根 Canvas
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 全屏蒙版
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; // 稍微加深一点对比度
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 确定透明挖空区域
  let hole = null;
  if (props.state.isSelecting || props.state.hasSelection) {
    hole = props.bounds;
  } else if (props.state.highlightedWindow) {
    hole = {
      x: props.state.highlightedWindow.left - props.state.offsetX,
      y: props.state.highlightedWindow.top - props.state.offsetY,
      w: props.state.highlightedWindow.width,
      h: props.state.highlightedWindow.height,
    };
  }

  if (hole) {
    ctx.clearRect(hole.x, hole.y, hole.w, hole.h);
  }
});

const windowHighlightStyle = computed(() => {
  if (!props.state.highlightedWindow || props.state.isSelecting || props.state.hasSelection) return { display: 'none' };

  const win = props.state.highlightedWindow;
  return {
    left: `${win.left - props.state.offsetX}px`,
    top: `${win.top - props.state.offsetY}px`,
    width: `${win.width}px`,
    height: `${win.height}px`,
  };
});
</script>

<template>
  <div class="absolute inset-0 z-10 pointer-events-none">
    <!-- Canvas 遮罩 -->
    <canvas ref="canvasRef" class="w-full h-full" />

    <!-- 窗口探测高亮 -->
    <div
      class="absolute border-2 border-[#2196F3] bg-[#2196F3]/10 shadow-[0_0_15px_rgba(33,150,243,0.5)] transition-all duration-100 ease-out box-border"
      :style="windowHighlightStyle"
    />

    <!-- 选区矩形 -->
    <div
      v-if="state.isSelecting || state.hasSelection"
      class="absolute border-2 border-[#2196F3] shadow-[0_0_0_2px_rgba(33,150,243,0.3)] box-border"
      :style="{
        left: bounds.x + 'px',
        top: bounds.y + 'px',
        width: bounds.w + 'px',
        height: bounds.h + 'px'
      }"
    >
      <div
        v-if="bounds.w > 0 && bounds.h > 0"
        class="absolute -top-7 left-0 bg-[#2196F3] text-white px-2 py-0.5 rounded text-xs whitespace-nowrap shadow-md"
      >
        {{ Math.round(bounds.w) }} × {{ Math.round(bounds.h) }}
      </div>
    </div>
  </div>
</template>
