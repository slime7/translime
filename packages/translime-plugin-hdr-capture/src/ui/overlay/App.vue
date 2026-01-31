<script setup>
import {
  computed, onMounted, onUnmounted, provide, reactive,
} from 'vue';
import FrozenScreens from './components/FrozenScreens.vue';
import SelectionRect from './components/SelectionRect.vue';
import ActionToolbar from './components/ActionToolbar.vue';
import HintBox from './components/HintBox.vue';
import Magnifier from './components/Magnifier.vue';

// ==================== 状态属性 ====================
const state = reactive({
  offsetX: 0,
  offsetY: 0,
  displays: [],
  capturedScreens: [],
  cursorPos: { x: 0, y: 0 },

  isSelecting: false,
  isDragging: false,
  isMoving: false,
  isResizing: false,
  resizeDirection: null,
  resizeActiveX: null,
  resizeActiveY: null,
  hasSelection: false,

  startX: 0,
  startY: 0,
  endX: 0,
  endY: 0,

  // 移动选区时
  moveOriginX: 0,
  moveOriginY: 0,
  rectAtStartMove: null,

  // 探测到的窗口
  highlightedWindow: null,
  allWindows: [], // 所有预捕获的窗口信息
  candidates: [], // 当前坐标下的候选窗口列表
  candidateIndex: 0, // 当前选中的候选窗口索引

  // 调试模式
  isDebug: false,
});

// 计算选区边界 (逻辑坐标)
const selectionBounds = computed(() => {
  const x = Math.min(state.startX, state.endX);
  const y = Math.min(state.startY, state.endY);
  const w = Math.abs(state.endX - state.startX);
  const h = Math.abs(state.endY - state.startY);

  return {
    x: Number.isNaN(x) ? 0 : x,
    y: Number.isNaN(y) ? 0 : y,
    w: Number.isNaN(w) ? 0 : w,
    h: Number.isNaN(h) ? 0 : h,
  };
});

// 控制放大镜显示
const showMagnifier = computed(() => {
  // 1. 如果正在移动整个选区，不显示
  if (state.isMoving) return false;

  // 2. 如果正在拖拽选取 (isSelecting) 或者正在调整大小 (isResizing) -> 显示
  if (state.isSelecting || state.isResizing) return true;

  // 3. 如果还没有选区，且不在移动状态 -> 显示 (用于辅助定位起始点)
  if (!state.hasSelection) return true;

  // 其他情况（也就是：有选区，且静止，且没在调整大小）-> 不显示
  return false;
});

// ==================== 交互逻辑 (Helpers) ====================
function closeOverlay() {
  window.hdrCapture?.close?.();
}

function handleCancel() {
  if (state.hasSelection) {
    state.hasSelection = false;
    state.isSelecting = false;
    state.isDragging = false;
    state.isMoving = false;
    state.highlightedWindow = null;
  } else {
    closeOverlay();
  }
}

// ==================== 交互逻辑 (Helpers) ====================

const findDisplayAtLocalPoint = (lx, ly) => {
  const gx = lx + state.offsetX;
  const gy = ly + state.offsetY;
  return state.displays.find((d) => {
    const b = d.bounds;
    return gx >= b.x && gx < b.x + b.width && gy >= b.y && gy < b.y + b.height;
  }) || state.displays[0];
};

const detectWindow = (lx, ly) => {
  if (state.isSelecting || state.isMoving || state.hasSelection) return;

  const gx = lx + state.offsetX;
  const gy = ly + state.offsetY;

  // 找出包含该点的所有窗口
  const newCandidates = state.allWindows.filter((win) => (
    gx >= win.left && gx < win.right && gy >= win.top && gy < win.bottom
  ));

  // 按面积升序排序 (从小到大)
  newCandidates.sort((a, b) => (a.width * a.height) - (b.width * b.height));

  // 比较候选列表是否发生变化（通过句柄判断）
  const candidatesChanged = newCandidates.length !== state.candidates.length
    || newCandidates.some((c, i) => c.handle !== state.candidates[i]?.handle);

  if (candidatesChanged) {
    state.candidates = newCandidates;
    state.candidateIndex = 0;
    state.highlightedWindow = newCandidates.length > 0 ? newCandidates[0] : null;
  }
};

const onWheel = (e) => {
  // 仅在未选择、未移动、有候选窗口时响应
  if (state.isSelecting || state.isMoving || state.hasSelection) return;
  if (state.candidates.length <= 1) return;

  e.preventDefault();

  if (e.deltaY > 0) {
    state.candidateIndex = (state.candidateIndex + 1) % state.candidates.length;
  } else {
    state.candidateIndex = (state.candidateIndex - 1 + state.candidates.length) % state.candidates.length;
  }

  state.highlightedWindow = state.candidates[state.candidateIndex];
};

const onResizeStart = (direction) => {
  state.isResizing = true;
  state.resizeDirection = direction;

  const isLeft = state.startX < state.endX;
  const isTop = state.startY < state.endY;

  // Reset active axes
  state.resizeActiveX = null;
  state.resizeActiveY = null;

  // Map direction to variable
  if (direction.includes('w')) state.resizeActiveX = isLeft ? 'startX' : 'endX';
  if (direction.includes('e')) state.resizeActiveX = isLeft ? 'endX' : 'startX';
  if (direction.includes('n')) state.resizeActiveY = isTop ? 'startY' : 'endY';
  if (direction.includes('s')) state.resizeActiveY = isTop ? 'endY' : 'startY';
};

const onMouseDown = (e) => {
  if (e.button !== 0) return;

  const mx = e.clientX;
  const my = e.clientY;

  if (state.hasSelection) {
    const b = selectionBounds.value;
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      state.isMoving = true;
      state.moveOriginX = mx;
      state.moveOriginY = my;
      state.rectAtStartMove = {
        startX: state.startX,
        startY: state.startY,
        endX: state.endX,
        endY: state.endY,
      };
      return;
    }
    state.hasSelection = false;
  }

  state.isSelecting = true;
  state.isDragging = false;
  state.startX = mx;
  state.startY = my;
  state.endX = mx;
  state.endY = my;
};

const onMouseMove = (e) => {
  try {
    const mx = e.clientX;
    const my = e.clientY;
    state.cursorPos = { x: mx, y: my };

    if (state.isResizing) {
      if (state.resizeActiveX) state[state.resizeActiveX] = mx;
      if (state.resizeActiveY) state[state.resizeActiveY] = my;
      return;
    }

    if (state.isMoving) {
      const dx = mx - state.moveOriginX;
      const dy = my - state.moveOriginY;
      state.startX = state.rectAtStartMove.startX + dx;
      state.startY = state.rectAtStartMove.startY + dy;
      state.endX = state.rectAtStartMove.endX + dx;
      state.endY = state.rectAtStartMove.endY + dy;
      return;
    }

    if (state.isSelecting) {
      const dx = mx - state.startX;
      const dy = my - state.startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        state.isDragging = true;
        state.highlightedWindow = null;
        state.endX = mx;
        state.endY = my;
      }
      return;
    }

    detectWindow(mx, my);
  } catch (err) {
    console.error('onMouseMove error', err);
  }
};

const onMouseUp = (e) => {
  try {
    if (e.button !== 0) return;

    if (state.isResizing) {
      state.isResizing = false;
      state.resizeDirection = null;
      state.resizeActiveX = null;
      state.resizeActiveY = null;
      return;
    }

    if (state.isMoving) {
      state.isMoving = false;
      return;
    }

    if (state.isSelecting) {
      state.isSelecting = false;
      if (!state.isDragging) {
        if (state.highlightedWindow) {
          state.startX = state.highlightedWindow.left - state.offsetX;
          state.startY = state.highlightedWindow.top - state.offsetY;
          state.endX = state.startX + state.highlightedWindow.width;
          state.endY = state.startY + state.highlightedWindow.height;
          state.hasSelection = true;
        } else {
          state.hasSelection = false;
        }
      } else {
        const b = selectionBounds.value;
        state.hasSelection = b.w > 1 && b.h > 1;
      }
    }
  } catch (err) {
    console.error('onMouseUp error', err);
  }
};

const onContextMenu = (e) => {
  e.preventDefault();
  handleCancel();
};

// ==================== 初始化与清理 ====================
const blobUrls = [];
function clearBlobUrls() {
  blobUrls.forEach((url) => URL.revokeObjectURL(url));
  blobUrls.length = 0;
}

onMounted(() => {
  if (window.hdrCapture?.onInit) {
    window.hdrCapture.onInit((data) => {
      state.isDebug = !!data.isDebug;
      state.offsetX = data.minX;
      state.offsetY = data.minY;
      state.displays = data.displays || [];

      clearBlobUrls();
      state.capturedScreens = (data.capturedScreens || []).map((s) => {
        const blob = new Blob([s.data], { type: 'image/webp' });
        const url = URL.createObjectURL(blob);
        blobUrls.push(url);
        return { ...s, url };
      });

      if (data.cursorPos) {
        state.cursorPos = {
          x: data.cursorPos.x - state.offsetX,
          y: data.cursorPos.y - state.offsetY,
        };
      }

      state.allWindows = data.windows || [];
    });
  }

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
});

onUnmounted(() => {
  clearBlobUrls();
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
});

// ==================== 操作处理 ====================
const handleAction = async (type) => {
  if (type === 'cancel') {
    handleCancel();
    return;
  }

  // 立即关闭选区显示，防止截图抓取到 Overlay 的黑色遮罩
  state.hasSelection = false;

  const b = selectionBounds.value;
  const rect = {
    x: b.x + state.offsetX,
    y: b.y + state.offsetY,
    width: b.w,
    height: b.h,
  };

  const baseLogger = window.ts?.logger || console;
  const logger = baseLogger.child ? baseLogger.child({ plugin_id: 'translime-plugin-hdr-capture', context: 'Overlay' }) : baseLogger;

  logger.info(`执行操作: ${type}, 选区:`, { rect });

  try {
    if (type === 'save') {
      if (state.isDebug) {
        logger.info('Debug模式: 跳过 save 操作');
      } else {
        const res = await window.hdrCapture.saveCapture(rect);
        logger.info('保存操作返回:', { res });
      }
    } else if (type === 'copy') {
      if (state.isDebug) {
        logger.info('Debug模式: 跳过 copy 操作');
      } else {
        const res = await window.hdrCapture.copyCapture(rect);
        logger.info('复制操作返回:', { res });
      }
    }
  } catch (err) {
    logger.error(`操作 ${type} 失败:`, err);
  }
  closeOverlay();
};

provide('state', state);
provide('selectionBounds', selectionBounds);
provide('actions', { handleAction, closeOverlay });
provide('utils', { findDisplayAtLocalPoint });

const rootCursor = computed(() => {
  if (state.isResizing && state.resizeDirection) {
    return `${state.resizeDirection}-resize`;
  }
  if (state.isMoving) {
    return 'move';
  }
  return 'crosshair';
});
</script>

<template>
  <div
    class="relative w-screen h-screen overflow-hidden select-none"
    :style="{ cursor: rootCursor }"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @wheel="onWheel"
    @contextmenu="onContextMenu"
  >
    <!-- 冻结画面背景 (Debug 模式下不显示) -->
    <FrozenScreens
      v-if="!state.isDebug"
      :screens="state.capturedScreens"
      :offset-x="state.offsetX"
      :offset-y="state.offsetY"
    />

    <!-- 遮罩与高亮 -->
    <SelectionRect
      :state="state"
      :bounds="selectionBounds"
      @resize-start="onResizeStart"
    />

    <!-- 信息提示 -->
    <HintBox :cursor-pos="state.cursorPos" />

    <!-- 操作工具栏 : (Debug 模式下依然显示，功能有 mock) -->
    <!-- 操作工具栏 : (Debug 模式下依然显示，功能有 mock) -->
    <ActionToolbar
      :visible="state.hasSelection && !state.isSelecting && !state.isMoving && !state.isResizing"
      :bounds="selectionBounds"
      @mousedown.stop
    />

    <!-- 放大镜 (High Priority Z-Index) -->
    <Magnifier
      v-if="showMagnifier"
      :cursor-pos="state.cursorPos"
      :screens="state.capturedScreens"
      :offset-x="state.offsetX"
      :offset-y="state.offsetY"
    />
  </div>
</template>

<style>
/* App 级别的自定义样式可以放在这里 */
</style>
