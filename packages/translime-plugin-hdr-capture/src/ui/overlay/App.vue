<script setup>
import {
  computed, onMounted, onUnmounted, provide, reactive,
} from 'vue';
import FrozenScreens from './components/FrozenScreens.vue';
import SelectionRect from './components/SelectionRect.vue';
import ActionToolbar from './components/ActionToolbar.vue';
import HintBox from './components/HintBox.vue';

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

function onKeyDown(e) {
  if (e.key === 'Escape') {
    handleCancel();
  }
}

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

  window.addEventListener('keydown', onKeyDown);
});

onUnmounted(() => {
  clearBlobUrls();
  window.removeEventListener('keydown', onKeyDown);
});

// ==================== 交互逻辑 ====================

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

  // 阻止默认滚动行为
  e.preventDefault();

  // 滚轮向上 (deltaY < 0) 切换到更小的窗口？通常习惯上滚是往“上”层，即面积更小
  // 这里我们统一定义：向下滚切换到更大的（底层）窗口，向上滚切换到更小的（顶层）窗口
  if (e.deltaY > 0) {
    state.candidateIndex = (state.candidateIndex + 1) % state.candidates.length;
  } else {
    state.candidateIndex = (state.candidateIndex - 1 + state.candidates.length) % state.candidates.length;
  }

  state.highlightedWindow = state.candidates[state.candidateIndex];
};

const onMouseDown = (e) => {
  // 仅响应左键
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
    // 点击选区外，取消当前选区重画
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
  const mx = e.clientX;
  const my = e.clientY;
  state.cursorPos = { x: mx, y: my };

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
};

const onMouseUp = (e) => {
  if (e.button !== 0) return;

  if (state.isMoving) {
    state.isMoving = false;
    return;
  }

  if (state.isSelecting) {
    state.isSelecting = false;
    // 如果没有真正的拖拽（即单击）
    if (!state.isDragging) {
      if (state.highlightedWindow) {
        state.startX = state.highlightedWindow.left - state.offsetX;
        state.startY = state.highlightedWindow.top - state.offsetY;
        state.endX = state.startX + state.highlightedWindow.width;
        state.endY = state.startY + state.highlightedWindow.height;
        state.hasSelection = true;
      } else {
        // 单击空白处，什么都不选
        state.hasSelection = false;
      }
    } else {
      // 检查选区大小，太小则取消 (过滤 1x1 及以下的误操作)
      const b = selectionBounds.value;
      state.hasSelection = b.w > 1 && b.h > 1;
    }
  }
};

const onContextMenu = (e) => {
  e.preventDefault();
  handleCancel();
};

// ==================== 操作处理 ====================
const handleAction = async (type) => {
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

</script>

<template>
  <div
    class="relative w-screen h-screen overflow-hidden select-none cursor-crosshair"
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
    <SelectionRect :state="state" :bounds="selectionBounds" />

    <!-- 信息提示 -->
    <HintBox :cursor-pos="state.cursorPos" />

    <!-- 操作工具栏 : (Debug 模式下依然显示，功能有 mock) -->
    <ActionToolbar
      v-if="state.hasSelection && !state.isSelecting && !state.isMoving"
      :bounds="selectionBounds"
      @mousedown.stop
    />
  </div>
</template>

<style>
/* App 级别的自定义样式可以放在这里 */
</style>
