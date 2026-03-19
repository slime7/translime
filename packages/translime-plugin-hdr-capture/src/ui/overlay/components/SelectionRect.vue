<script setup>
import { computed, ref, watchEffect } from 'vue';

const emit = defineEmits(['resize-start']);

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
    const {
      x, y, w, h,
    } = hole;
    // 仅在当前选区状态下使用 state 中的 borderRadius
    // 注意：高亮窗口 (highlightedWindow) 暂不支持圆角，除非后续有需求
    const r = (props.state.isSelecting || props.state.hasSelection)
      ? (props.state.borderRadius || 0)
      : 0;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();

    // 如果浏览器支持标准 roundRect API (Chrome 99+) 则直接使用
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      // 兼容回退方案
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
    }

    ctx.fillStyle = 'black';
    ctx.fill();
    ctx.restore();
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

const onHandleMouseDown = (direction) => {
  emit('resize-start', direction);
};
</script>

<template>
  <div class="absolute inset-0 z-10 pointer-events-none">
    <!-- Canvas 遮罩 -->
    <canvas ref="canvasRef" class="w-full h-full" />

    <!-- 窗口探测高亮 -->
    <div
      class="absolute border-2 border-dashed border-[#38bdf8] bg-[#38bdf8]/15 transition-all duration-150 ease-out box-border rounded-sm shadow-[0_0_15px_rgba(56,189,248,0.3)]"
      :style="windowHighlightStyle"
    />

    <!-- 选区矩形 -->
    <div
      v-if="state.isSelecting || state.hasSelection"
      class="absolute border-[1.5px] border-solid border-[#38bdf8] box-border pointer-events-auto shadow-[0_0_0_1px_rgba(0,0,0,0.2),0_4px_24px_rgba(0,0,0,0.3),inset_0_0_0_1px_rgba(255,255,255,0.1)]"
      :class="state.drawingMode ? 'cursor-crosshair' : 'cursor-move'"
      :style="{
        left: bounds.x + 'px',
        top: bounds.y + 'px',
        width: bounds.w + 'px',
        height: bounds.h + 'px',
        borderRadius: (state.borderRadius || 0) + 'px'
      }"
    >
      <div
        v-if="bounds.w > 80 && bounds.h > 24"
        class="absolute -top-7 left-0 bg-black/75 backdrop-blur-md text-white px-2 py-1 rounded-md text-xs whitespace-nowrap shadow-lg pointer-events-none border border-white/10 font-mono tracking-wide"
      >
        {{ Math.round(bounds.w) }} × {{ Math.round(bounds.h) }}
      </div>

      <!-- Resize Handles -->
      <template v-if="!state.isMoving && state.hasSelection && !state.drawingMode">
        <!-- Top Left -->
        <div
          class="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-[#38bdf8] rounded-full cursor-nw-resize z-20 shadow-sm"
          @mousedown.stop="onHandleMouseDown('nw')"
        />
        <!-- Top -->
        <div
          class="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border border-[#38bdf8] rounded-full cursor-n-resize z-20 shadow-sm"
          @mousedown.stop="onHandleMouseDown('n')"
        />
        <!-- Top Right -->
        <div
          class="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-[#38bdf8] rounded-full cursor-ne-resize z-20 shadow-sm"
          @mousedown.stop="onHandleMouseDown('ne')"
        />
        <!-- Right -->
        <div
          class="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white border border-[#38bdf8] rounded-full cursor-e-resize z-20 shadow-sm"
          @mousedown.stop="onHandleMouseDown('e')"
        />
        <!-- Bottom Right -->
        <div
          class="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-[#38bdf8] rounded-full cursor-se-resize z-20 shadow-sm"
          @mousedown.stop="onHandleMouseDown('se')"
        />
        <!-- Bottom -->
        <div
          class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border border-[#38bdf8] rounded-full cursor-s-resize z-20 shadow-sm"
          @mousedown.stop="onHandleMouseDown('s')"
        />
        <!-- Bottom Left -->
        <div
          class="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-[#38bdf8] rounded-full cursor-sw-resize z-20 shadow-sm"
          @mousedown.stop="onHandleMouseDown('sw')"
        />
        <!-- Left -->
        <div
          class="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-white border border-[#38bdf8] rounded-full cursor-w-resize z-20 shadow-sm"
          @mousedown.stop="onHandleMouseDown('w')"
        />
      </template>
    </div>
  </div>
</template>
