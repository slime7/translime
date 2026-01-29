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
});

// 计算选区边界 (逻辑坐标)
const selectionBounds = computed(() => {
  const x = Math.min(state.startX, state.endX);
  const y = Math.min(state.startY, state.endY);
  const w = Math.abs(state.endX - state.startX);
  const h = Math.abs(state.endY - state.startY);

  return {
    x: isNaN(x) ? 0 : x,
    y: isNaN(y) ? 0 : y,
    w: isNaN(w) ? 0 : w,
    h: isNaN(h) ? 0 : h,
  };
});

// ==================== 初始化与清理 ====================
const blobUrls = [];
function clearBlobUrls() {
  blobUrls.forEach((url) => URL.revokeObjectURL(url));
  blobUrls.length = 0;
}

onMounted(() => {
  if (window.hdrCapture?.onInit) {
    window.hdrCapture.onInit((data) => {
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
    });
  }

  window.addEventListener('keydown', onKeyDown);
});

onUnmounted(() => {
  clearBlobUrls();
  window.removeEventListener('keydown', onKeyDown);
});

// ==================== 交互逻辑 ====================

const onKeyDown = (e) => {
  if (e.key === 'Escape') {
    handleCancel();
  }
};

const handleCancel = () => {
  if (state.hasSelection) {
    state.hasSelection = false;
    state.isSelecting = false;
    state.isDragging = false;
    state.isMoving = false;
    state.highlightedWindow = null;
  } else {
    closeOverlay();
  }
};

const closeOverlay = () => {
  window.hdrCapture?.close?.();
};

const findDisplayAtLocalPoint = (lx, ly) => {
  const gx = lx + state.offsetX;
  const gy = ly + state.offsetY;
  return state.displays.find((d) => {
    const b = d.bounds;
    return gx >= b.x && gx < b.x + b.width && gy >= b.y && gy < b.y + b.height;
  }) || state.displays[0];
};

const detectWindow = async (lx, ly) => {
  if (state.isSelecting || state.isMoving || state.hasSelection) return;

  try {
    const win = await window.hdrCapture.getWindowAtPoint(lx + state.offsetX, ly + state.offsetY);
    state.highlightedWindow = win;
  } catch (e) {
    state.highlightedWindow = null;
  }
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
      // 检查选区大小，太小则取消
      const b = selectionBounds.value;
      if (b.w < 2 && b.h < 2) {
        state.hasSelection = false;
      } else {
        state.hasSelection = true;
      }
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

  const logger = window.ts?.logger || console;
  logger.info(`[Overlay] 执行操作: ${type}, 选区:`, rect);

  try {
    if (type === 'save') {
      const res = await window.hdrCapture.saveCapture(rect);
      logger.info('[Overlay] 保存操作返回:', res);
    } else if (type === 'copy') {
      const res = await window.hdrCapture.copyCapture(rect);
      logger.info('[Overlay] 复制操作返回:', res);
    }
  } catch (err) {
    logger.error(`[Overlay] 操作 ${type} 失败:`, err);
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
    @contextmenu="onContextMenu"
  >
    <!-- 冻结画面背景 -->
    <FrozenScreens :screens="state.capturedScreens" :offset-x="state.offsetX" :offset-y="state.offsetY" />

    <!-- 遮罩与高亮 -->
    <SelectionRect :state="state" :bounds="selectionBounds" />

    <!-- 信息提示 -->
    <HintBox :cursor-pos="state.cursorPos" />

    <!-- 操作工具栏 : 使用 @mousedown.stop 阻止点击工具栏导致背景开始重选 -->
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
