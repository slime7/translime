<script setup>
import {
  computed, onMounted, onUnmounted, provide, reactive,
} from 'vue';
import { useLogger } from 'translime-sdk';
import FrozenScreens from './components/FrozenScreens.vue';
import SelectionRect from './components/SelectionRect.vue';
import ActionToolbar from './components/ActionToolbar.vue';
import HintBox from './components/HintBox.vue';
import Magnifier from './components/Magnifier.vue';

const PLUGIN_ID = 'translime-plugin-hdr-capture';
const baseLogger = useLogger();
const logger = baseLogger.child ? baseLogger.child({ plugin_id: PLUGIN_ID, context: 'Overlay' }) : baseLogger;

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

  // 截图设置
  borderRadius: 0,
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
  // 移动选区时不显示
  if (state.isMoving) return false;

  // 调整或创建选区时显示
  if (state.isSelecting || state.isResizing) return true;

  // 无选区时显示辅助定位
  if (!state.hasSelection) return true;

  // 其他情况（也就是：有选区，且静止，且没在调整大小）-> 不显示
  return false;
});

// ==================== 交互逻辑 (Helpers) ====================

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
  } else if (!state.highlightedWindow && newCandidates.length > 0) {
    // 特殊情况：列表没变，但当前未选中任何窗口（例如刚取消选区），强制恢复选中
    state.candidateIndex = 0;
    [state.highlightedWindow] = newCandidates;
  }
};

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

    // 取消选区后，立即重新检测当前鼠标下的窗口
    if (state.cursorPos) {
      detectWindow(state.cursorPos.x, state.cursorPos.y);
    }
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
    borderRadius: state.borderRadius,
  };

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

const onDoubleClick = (e) => {
  if (e.button !== 0) return;
  if (state.hasSelection) {
    const b = selectionBounds.value;
    const mx = e.clientX;
    const my = e.clientY;
    // Check if double click is within selection bounds
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      handleAction('copy');
    }
  }
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
    // 点击空白处取消选区后，重新开始检测窗口
    detectWindow(mx, my);
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
    logger.error('onMouseMove error', err);
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
    logger.error('onMouseUp error', err);
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

function resetState() {
  state.hasSelection = false;
  state.isSelecting = false;
  state.isDragging = false;
  state.isMoving = false;
  state.isResizing = false;
  state.highlightedWindow = null;
  state.startX = 0;
  state.startY = 0;
  state.endX = 0;
  state.endY = 0;
  state.candidates = [];

  clearBlobUrls();
  state.capturedScreens = [];
  state.allWindows = [];
  state.displays = [];
}

onMounted(() => {
  if (window.hdrCapture?.onInit) {
    window.hdrCapture.onInit((data) => {
      const now = Date.now();
      const startTime = data.startTime || now;
      logger.info(`[Perf] UI 收到初始化数据, 开始处理 (T+${now - startTime}ms)`);

      // 先重置所有状态
      resetState();

      state.isDebug = !!data.isDebug;
      state.offsetX = data.minX;
      state.offsetY = data.minY;
      state.displays = data.displays || [];

      // 设置新数据
      state.isSelecting = false;
      state.isDragging = false;
      state.isMoving = false;
      state.isResizing = false;
      state.highlightedWindow = null;
      state.startX = 0;
      state.startY = 0;
      state.endX = 0;
      state.endY = 0;
      state.candidates = [];

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

      // 立即触发一次窗口检测，确保静止状态下也能高亮当前窗口
      if (state.cursorPos) {
        // 注意：detectWindow 接收的是本地坐标 (相对于 Overlay 左上角)
        // state.cursorPos 已经在上面转换为本地坐标了
        detectWindow(state.cursorPos.x, state.cursorPos.y);
      }

      logger.info(`[Perf] UI 数据处理完成, 等待渲染更新 (T+${Date.now() - startTime}ms)`);
    });
  }

  if (window.hdrCapture?.onReset) {
    window.hdrCapture.onReset(() => {
      logger.info('收到重置信号，清空状态');
      resetState();
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
    @dblclick="onDoubleClick"
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
    <ActionToolbar
      v-if="state.hasSelection && !state.isSelecting && !state.isMoving && !state.isResizing"
      :visible="true"
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

</style>
