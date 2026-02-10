<script setup>
import {
  computed, onMounted, onUnmounted, provide, reactive, watch,
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

  // 绘图工具状态
  drawingMode: false,
  rectConfig: {
    type: 'stroke',
    strokeWidth: 2,
    color: 'rgba(255, 0, 0, 1)',
  },
  annotations: [],
  activeAnnotation: null,
  isDrawingRect: false,
  drawingDragged: false,
  isResizingAnnotation: false,
  annotationResizeDir: null,
  annResizeActiveX: null,
  annResizeActiveY: null,
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

// 活动标注的边界计算
const activeAnnotationBounds = computed(() => {
  const ann = state.activeAnnotation;
  if (!ann) {
    return null;
  }
  return {
    x: Math.min(ann.startX, ann.endX),
    y: Math.min(ann.startY, ann.endY),
    w: Math.abs(ann.endX - ann.startX),
    h: Math.abs(ann.endY - ann.startY),
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

// ==================== 标注辅助函数 ====================
let annotationIdCounter = 0;

/** 将活动标注定型并推入标注列表 */
const finalizeAnnotation = () => {
  if (!state.activeAnnotation) {
    return;
  }
  const bounds = activeAnnotationBounds.value;
  if (bounds && bounds.w > 2 && bounds.h > 2) {
    annotationIdCounter += 1;
    state.annotations.push({
      id: annotationIdCounter,
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: bounds.h,
      type: state.rectConfig.type,
      strokeWidth: state.rectConfig.strokeWidth,
      color: state.rectConfig.color,
    });
  }
  state.activeAnnotation = null;
};

/** 开始标注矩形的尺寸调整 */
const startAnnotationResize = (direction) => {
  state.isResizingAnnotation = true;
  state.annotationResizeDir = direction;

  const ann = state.activeAnnotation;
  const isLeft = ann.startX < ann.endX;
  const isTop = ann.startY < ann.endY;

  state.annResizeActiveX = null;
  state.annResizeActiveY = null;

  if (direction.includes('w')) {
    state.annResizeActiveX = isLeft ? 'startX' : 'endX';
  }
  if (direction.includes('e')) {
    state.annResizeActiveX = isLeft ? 'endX' : 'startX';
  }
  if (direction.includes('n')) {
    state.annResizeActiveY = isTop ? 'startY' : 'endY';
  }
  if (direction.includes('s')) {
    state.annResizeActiveY = isTop ? 'endY' : 'startY';
  }
};

/**
 * 获取定型标注的样式
 * @param {object} ann - 标注对象
 * @returns {object}
 */
const getAnnotationStyle = (ann) => {
  const style = {
    position: 'absolute',
    left: `${ann.x}px`,
    top: `${ann.y}px`,
    width: `${ann.w}px`,
    height: `${ann.h}px`,
    pointerEvents: 'none',
    boxSizing: 'border-box',
  };

  if (ann.type === 'stroke') {
    style.border = `${ann.strokeWidth}px solid ${ann.color}`;
    style.background = 'transparent';
  } else {
    style.background = ann.color;
  }

  return style;
};

/** 活动标注样式（响应式跟随 rectConfig） */
const activeAnnotationStyle = computed(() => {
  const ann = activeAnnotationBounds.value;
  if (!ann) {
    return {};
  }
  const cfg = state.rectConfig;
  const style = {
    position: 'absolute',
    left: `${ann.x}px`,
    top: `${ann.y}px`,
    width: `${ann.w}px`,
    height: `${ann.h}px`,
    pointerEvents: 'none',
    boxSizing: 'border-box',
  };

  if (cfg.type === 'stroke') {
    style.border = `${cfg.strokeWidth}px solid ${cfg.color}`;
    style.background = 'transparent';
  } else {
    style.background = cfg.color;
  }

  return style;
});

// drawingMode 关闭时自动定型活动标注
watch(() => state.drawingMode, (newVal, oldVal) => {
  if (oldVal && !newVal) {
    finalizeAnnotation();
  }
});

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

// ==================== 标注渲染 ====================

/**
 * 将所有标注绘制到离屏 Canvas，返回 RGBA 像素数据
 * @param {number} w - 选区逻辑宽度
 * @param {number} h - 选区逻辑高度
 * @param {number} originX - 选区左上角 X（屏幕逻辑坐标）
 * @param {number} originY - 选区左上角 Y（屏幕逻辑坐标）
 * @returns {{ buffer: Uint8Array, width: number, height: number } | null}
 */
const renderAnnotationsToBuffer = (w, h, originX, originY) => {
  // 定型活动标注（如果有）
  finalizeAnnotation();

  const allAnnotations = state.annotations;
  if (allAnnotations.length === 0) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  allAnnotations.forEach((ann) => {
    // 转换为选区内部坐标
    const ax = ann.x - originX;
    const ay = ann.y - originY;

    if (ann.type === 'stroke') {
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = ann.strokeWidth;
      // strokeRect 的坐标需要向内偏移半个线宽，以保证边框完全在矩形内
      const halfLW = ann.strokeWidth / 2;
      ctx.strokeRect(ax + halfLW, ay + halfLW, ann.w - ann.strokeWidth, ann.h - ann.strokeWidth);
    } else {
      ctx.fillStyle = ann.color;
      ctx.fillRect(ax, ay, ann.w, ann.h);
    }
  });

  const imageData = ctx.getImageData(0, 0, w, h);
  return {
    buffer: new Uint8Array(imageData.data.buffer),
    width: w,
    height: h,
  };
};

// ==================== 操作处理 ====================
const handleAction = async (type) => {
  if (type === 'cancel') {
    handleCancel();
    return;
  }

  const b = selectionBounds.value;

  // 在关闭选区前渲染标注到像素数据
  const overlayData = renderAnnotationsToBuffer(b.w, b.h, b.x, b.y);

  // 立即关闭选区显示，防止截图抓取到 Overlay 的黑色遮罩
  state.hasSelection = false;

  const rect = {
    x: b.x + state.offsetX,
    y: b.y + state.offsetY,
    width: b.w,
    height: b.h,
    borderRadius: state.borderRadius,
  };

  // 附加标注叠加层数据（如果有标注）
  if (overlayData) {
    rect.overlayData = overlayData;
  }

  logger.info(`执行操作: ${type}, 选区:`, { rect: { ...rect, overlayData: overlayData ? '[present]' : null } });

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
  if (e.button !== 0) {
    return;
  }

  const mx = e.clientX;
  const my = e.clientY;

  // 绘图模式下的鼠标按下逻辑
  if (state.drawingMode && state.hasSelection) {
    const b = selectionBounds.value;
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      // 定型当前活动标注
      if (state.activeAnnotation) {
        finalizeAnnotation();
      }
      // 开始绘制新矩形
      state.isDrawingRect = true;
      state.drawingDragged = false;
      state.activeAnnotation = {
        startX: mx,
        startY: my,
        endX: mx,
        endY: my,
      };
    }
    return;
  }

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

    // 标注矩形尺寸调整
    if (state.isResizingAnnotation && state.activeAnnotation) {
      if (state.annResizeActiveX) {
        state.activeAnnotation[state.annResizeActiveX] = mx;
      }
      if (state.annResizeActiveY) {
        state.activeAnnotation[state.annResizeActiveY] = my;
      }
      return;
    }

    // 绘制标注矩形
    if (state.isDrawingRect && state.activeAnnotation) {
      const dx = mx - state.activeAnnotation.startX;
      const dy = my - state.activeAnnotation.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        state.drawingDragged = true;
      }
      state.activeAnnotation.endX = mx;
      state.activeAnnotation.endY = my;
      return;
    }

    if (state.isResizing) {
      if (state.resizeActiveX) {
        state[state.resizeActiveX] = mx;
      }
      if (state.resizeActiveY) {
        state[state.resizeActiveY] = my;
      }
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
    if (e.button !== 0) {
      return;
    }

    // 标注尺寸调整结束
    if (state.isResizingAnnotation) {
      state.isResizingAnnotation = false;
      state.annotationResizeDir = null;
      state.annResizeActiveX = null;
      state.annResizeActiveY = null;
      return;
    }

    // 绘制标注矩形结束
    if (state.isDrawingRect) {
      state.isDrawingRect = false;
      if (!state.drawingDragged || !state.activeAnnotation) {
        // 仅点击未拖拽，丢弃
        state.activeAnnotation = null;
      } else {
        const w = Math.abs(state.activeAnnotation.endX - state.activeAnnotation.startX);
        const h = Math.abs(state.activeAnnotation.endY - state.activeAnnotation.startY);
        if (w < 3 || h < 3) {
          state.activeAnnotation = null;
        }
      }
      state.drawingDragged = false;
      return;
    }

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

  // 重置绘图状态
  state.drawingMode = false;
  state.annotations = [];
  state.activeAnnotation = null;
  state.isDrawingRect = false;
  state.drawingDragged = false;
  state.isResizingAnnotation = false;
  state.annotationResizeDir = null;

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
  if (state.isResizingAnnotation && state.annotationResizeDir) {
    return `${state.annotationResizeDir}-resize`;
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

    <!-- 标注图层 -->
    <div
      v-if="state.hasSelection && (state.annotations.length > 0 || state.activeAnnotation)"
      class="absolute inset-0 z-20 pointer-events-none"
    >
      <!-- 已定型标注 -->
      <div
        v-for="ann in state.annotations"
        :key="ann.id"
        :style="getAnnotationStyle(ann)"
      />

      <!-- 活动标注（可调整大小） -->
      <div
        v-if="activeAnnotationBounds && activeAnnotationBounds.w > 0 && activeAnnotationBounds.h > 0"
        :style="activeAnnotationStyle"
      >
        <!-- 调整手柄（仅绘制完成后、非正在拖拽时显示） -->
        <template v-if="!state.isDrawingRect && state.activeAnnotation">
          <div
            class="absolute -top-1 -left-1 w-2.5 h-2.5 bg-white border border-blue-400 rounded-full cursor-nw-resize z-30 pointer-events-auto"
            @mousedown.stop="startAnnotationResize('nw')"
          />

          <div
            class="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white border border-blue-400 rounded-full cursor-n-resize z-30 pointer-events-auto"
            @mousedown.stop="startAnnotationResize('n')"
          />

          <div
            class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white border border-blue-400 rounded-full cursor-ne-resize z-30 pointer-events-auto"
            @mousedown.stop="startAnnotationResize('ne')"
          />

          <div
            class="absolute top-1/2 -right-1 -translate-y-1/2 w-2.5 h-2.5 bg-white border border-blue-400 rounded-full cursor-e-resize z-30 pointer-events-auto"
            @mousedown.stop="startAnnotationResize('e')"
          />

          <div
            class="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-white border border-blue-400 rounded-full cursor-se-resize z-30 pointer-events-auto"
            @mousedown.stop="startAnnotationResize('se')"
          />

          <div
            class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white border border-blue-400 rounded-full cursor-s-resize z-30 pointer-events-auto"
            @mousedown.stop="startAnnotationResize('s')"
          />

          <div
            class="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-white border border-blue-400 rounded-full cursor-sw-resize z-30 pointer-events-auto"
            @mousedown.stop="startAnnotationResize('sw')"
          />

          <div
            class="absolute top-1/2 -left-1 -translate-y-1/2 w-2.5 h-2.5 bg-white border border-blue-400 rounded-full cursor-w-resize z-30 pointer-events-auto"
            @mousedown.stop="startAnnotationResize('w')"
          />
        </template>
      </div>
    </div>

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
