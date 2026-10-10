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
    class="hint-box-container"
    :style="hintStyle"
  >
    <mat-card
      class="hint-card bg-mat-surface-container-high/85 text-mat-on-surface border-mat-outline-variant/20 shadow-mat-level2"
      variant="elevated"
    >
      <p class="hint-title text-mat-on-surface border-b border-mat-outline-variant/20">
        {{ state.captureMode === 'element' ? '界面元素模式' : '窗口模式' }}
      </p>
      <ul class="hint-list text-mat-on-surface-variant">
        <li>• Tab 切换窗口和界面元素模式</li>
        <li>• 滚轮切换同一位置的不同层级</li>
        <li>
          • {{ state.captureMode === 'element' ? '点击探测到的界面元素快速选区' : '点击探测到的窗口快速选区' }}
        </li>
        <li v-if="state.elementDetectionPending">
          • 正在更新界面元素候选
        </li>
        <li>
          • <kbd class="hint-kbd bg-mat-surface-container-highest/60 text-mat-on-surface">ESC</kbd> 取消
        </li>
      </ul>
    </mat-card>
  </div>
</template>

<style scoped>
.hint-box-container {
  position: absolute;
  z-index: 50;
  pointer-events: none;
  transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
}

.hint-card {
  width: max-content;
  max-width: 320px;
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
  background: var(--mat-sys-color-surface-container-high, rgba(18, 18, 20, 0.85));
  backdrop-filter: blur(18px) saturate(130%);
  border: 1px solid var(--mat-sys-color-outline-variant, rgba(255, 255, 255, 0.1));
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  border-radius: 12px;
}

.hint-title {
  margin-bottom: 4px;
  display: flex;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--mat-sys-color-outline-variant, rgba(255, 255, 255, 0.1));
  color: var(--mat-sys-color-on-surface, rgba(255, 255, 255, 0.9));
}

.hint-list {
  margin-top: 8px;
  opacity: 0.85;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--mat-sys-color-on-surface-variant, rgba(255, 255, 255, 0.8));
}

.hint-kbd {
  padding: 2px 4px;
  background: var(--mat-sys-color-surface-container-highest, rgba(255, 255, 255, 0.1));
  border-radius: 4px;
}
</style>
