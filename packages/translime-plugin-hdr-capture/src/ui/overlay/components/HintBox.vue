<script setup>
import { inject, ref, watchEffect } from 'vue';

const props = defineProps({
  cursorPos: {
    type: Object,
    default: () => ({ x: 0, y: 0 }),
  },
});

const { findDisplayAtLocalPoint } = inject('utils');
const state = inject('state');

// 上一次安全的位置角
const lastSafeCorner = ref('br');
const hintStyle = ref({ display: 'none' });

watchEffect(() => {
  const display = findDisplayAtLocalPoint(props.cursorPos.x, props.cursorPos.y);
  if (!display) {
    hintStyle.value = { display: 'none' };
    return;
  }

  const b = display.bounds;
  const localBounds = {
    left: b.x - state.offsetX,
    top: b.y - state.offsetY,
    right: b.x + b.width - state.offsetX,
    bottom: b.y + b.height - state.offsetY,
  };

  const margin = 20;
  const boxW = 240;
  const boxH = 120;

  // 候选角及其对应的包围盒
  const candidates = [
    {
      id: 'br', // bottom-right
      rect: {
        left: localBounds.right - margin - boxW, top: localBounds.bottom - margin - boxH, right: localBounds.right - margin, bottom: localBounds.bottom - margin,
      },
      style: { right: `${window.innerWidth - localBounds.right + margin}px`, bottom: `${window.innerHeight - localBounds.bottom + margin}px` },
    },
    {
      id: 'bl', // bottom-left
      rect: {
        left: localBounds.left + margin, top: localBounds.bottom - margin - boxH, right: localBounds.left + margin + boxW, bottom: localBounds.bottom - margin,
      },
      style: { left: `${localBounds.left + margin}px`, bottom: `${window.innerHeight - localBounds.bottom + margin}px` },
    },
    {
      id: 'tr', // top-right
      rect: {
        left: localBounds.right - margin - boxW, top: localBounds.top + margin, right: localBounds.right - margin, bottom: localBounds.top + margin + boxH,
      },
      style: { right: `${window.innerWidth - localBounds.right + margin}px`, top: `${localBounds.top + margin}px` },
    },
    {
      id: 'tl', // top-left
      rect: {
        left: localBounds.left + margin, top: localBounds.top + margin, right: localBounds.left + margin + boxW, bottom: localBounds.top + margin + boxH,
      },
      style: { left: `${localBounds.left + margin}px`, top: `${localBounds.top + margin}px` },
    },
  ];

  // 构建遮挡物列表
  const obstacles = [];

  // 获取高亮窗口
  if (state.highlightedWindow && !state.hasSelection && !state.isSelecting) {
    obstacles.push({
      left: state.highlightedWindow.left - state.offsetX,
      top: state.highlightedWindow.top - state.offsetY,
      right: state.highlightedWindow.left + state.highlightedWindow.width - state.offsetX,
      bottom: state.highlightedWindow.top + state.highlightedWindow.height - state.offsetY,
    });
  }

  // 获取选区及工具栏区域（工具栏约170x76，位于右下角下方，我们直接加大幅度包容它）
  if (state.hasSelection || state.isSelecting) {
    const minX = Math.min(state.startX, state.endX);
    const maxX = Math.max(state.startX, state.endX);
    const minY = Math.min(state.startY, state.endY);
    const maxY = Math.max(state.startY, state.endY);

    obstacles.push({
      left: minX - 10,
      top: minY - 10,
      right: maxX + 10,
      bottom: maxY + 100, // 包含下方可能出现的工具栏
    });
  }

  // 碰撞检测
  const isOverlap = (r1, r2) => !(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom);

  let bestCandidate = null;

  // 先尝试保留在上一个安全位置，避免抖动
  const lastCandidate = candidates.find((c) => c.id === lastSafeCorner.value);
  if (lastCandidate) {
    const overlap = obstacles.some((obs) => isOverlap(lastCandidate.rect, obs));
    if (!overlap) {
      bestCandidate = lastCandidate;
    }
  }

  // 若上一次位置被遮挡，则按顺序寻找第一个不碰撞的位置
  if (!bestCandidate) {
    bestCandidate = candidates.find((c) => {
      const overlap = obstacles.some((obs) => isOverlap(c.rect, obs));
      return !overlap;
    });
  }

  // 若四角都被遮挡，退化为使用右下角或停留在上一个位置
  if (!bestCandidate) {
    bestCandidate = lastCandidate || candidates[0];
  }

  lastSafeCorner.value = bestCandidate.id;
  hintStyle.value = bestCandidate.style;
});
</script>

<template>
  <div
    class="absolute z-50 pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
    :style="hintStyle"
    @mouseenter="onMouseEnter"
  >
    <div class="bg-black/75 text-white px-4 py-2 rounded-xl text-xs backdrop-blur-xs border border-white/10 shadow-lg">
      <p>点击探测到的窗口快速选区</p>
      <p>滚轮切换窗口层次</p>
      <p>esc 取消</p>
    </div>
  </div>
</template>
