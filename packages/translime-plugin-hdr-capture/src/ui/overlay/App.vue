<script setup>
import {
  computed, nextTick, onMounted, onUnmounted, provide, reactive, ref, watch,
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
  activeTool: null, // null | 'rect' | 'mosaic' | 'text'
  rectConfig: {
    type: 'stroke',
    strokeWidth: 2,
    color: 'rgba(255, 0, 0, 1)',
  },
  mosaicConfig: {
    mode: 'pixelate', // 'pixelate' | 'blur'
    blockSize: 10,
  },
  textConfig: {
    fontSize: 20,
    color: 'rgba(255, 0, 0, 1)',
    fontFamily: 'sans-serif',
  },
  annotations: [],
  activeAnnotation: null,
  isDrawingRect: false,
  drawingDragged: false,
  isResizingAnnotation: false,
  annotationResizeDir: null,
  annResizeActiveX: null,
  annResizeActiveY: null,
  isMovingAnnotation: false,
  annMoveOriginX: 0,
  annMoveOriginY: 0,
  annAtStartMove: null,

  // 文本编辑状态
  editingTextAnnotation: null, // 当前正在编辑的文本标注

  // 撤销历史
  history: [],
});

/** 文本输入框引用 */
const textInputRef = ref(null);

/** 活动马赛克预览 Canvas 引用 */
const activeMosaicCanvasRef = ref(null);

/** 预加载的冻结画面 Image 对象 */
const frozenImages = [];

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
    const tool = state.activeTool || 'rect';

    if (tool === 'mosaic') {
      state.annotations.push({
        id: annotationIdCounter,
        x: bounds.x,
        y: bounds.y,
        w: bounds.w,
        h: bounds.h,
        tool: 'mosaic',
        mode: state.mosaicConfig.mode,
        blockSize: state.mosaicConfig.blockSize,
      });
    } else {
      state.annotations.push({
        id: annotationIdCounter,
        x: bounds.x,
        y: bounds.y,
        w: bounds.w,
        h: bounds.h,
        tool: 'rect',
        type: state.rectConfig.type,
        strokeWidth: state.rectConfig.strokeWidth,
        color: state.rectConfig.color,
      });
    }
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

/** 开始拖动标注矩形的位置 */
const startAnnotationMove = (e) => {
  if (!state.activeAnnotation) {
    return;
  }
  state.isMovingAnnotation = true;
  state.annMoveOriginX = e.clientX;
  state.annMoveOriginY = e.clientY;
  state.annAtStartMove = {
    startX: state.activeAnnotation.startX,
    startY: state.activeAnnotation.startY,
    endX: state.activeAnnotation.endX,
    endY: state.activeAnnotation.endY,
  };
};

/**
 * 获取定型标注的样式
 * @param {object} ann - 标注对象
 * @returns {object}
 */
const getAnnotationStyle = (ann) => {
  // 马赛克标注不在 DOM 层用 div 渲染样式（它有专用 canvas 预览）
  if (ann.tool === 'mosaic') {
    return { display: 'none' };
  }

  // 文本标注不在此处渲染
  if (ann.tool === 'text') {
    return { display: 'none' };
  }

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

/** 活动标注样式（响应式跟随当前工具配置） */
const activeAnnotationStyle = computed(() => {
  const ann = activeAnnotationBounds.value;
  if (!ann) {
    return {};
  }

  const tool = state.activeTool || 'rect';

  // 马赛克工具不需要 DOM 样式预览，由单独的 canvas 元素实现
  if (tool === 'mosaic') {
    return {
      position: 'absolute',
      left: `${ann.x}px`,
      top: `${ann.y}px`,
      width: `${ann.w}px`,
      height: `${ann.h}px`,
      pointerEvents: 'none',
      boxSizing: 'border-box',
      background: 'transparent',
    };
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

// ==================== 撤销系统 ====================

/** 快照当前标注状态并压入历史栈 */
const pushHistory = () => {
  state.history.push({
    annotations: JSON.parse(JSON.stringify(state.annotations)),
    activeAnnotation: state.activeAnnotation
      ? { ...state.activeAnnotation }
      : null,
  });
};

/** 撤销上一次操作 */
const undo = () => {
  if (state.history.length === 0) {
    return;
  }
  const snapshot = state.history.pop();
  state.annotations = snapshot.annotations;
  state.activeAnnotation = snapshot.activeAnnotation;
};

// ==================== 文本标注 ====================

/** 定型当前正在编辑的文本标注 */
const finalizeTextAnnotation = () => {
  if (!state.editingTextAnnotation) {
    return;
  }

  const ta = state.editingTextAnnotation;
  if (ta.text && ta.text.trim().length > 0) {
    annotationIdCounter += 1;
    state.annotations.push({
      id: annotationIdCounter,
      x: ta.x,
      y: ta.y,
      tool: 'text',
      text: ta.text,
      fontSize: state.textConfig.fontSize,
      color: state.textConfig.color,
      fontFamily: state.textConfig.fontFamily,
    });
  }
  state.editingTextAnnotation = null;
};

/** 工具切换时自动定型文本 */
watch(() => state.activeTool, (newVal, oldVal) => {
  if (oldVal === 'text' && newVal !== 'text') {
    finalizeTextAnnotation();
  }
});

/** 文本输入框自动尺寸 */
const textAreaSize = computed(() => {
  if (!state.editingTextAnnotation) {
    return { width: 4, height: 28 };
  }
  const text = state.editingTextAnnotation.text || '';
  const lines = text.split('\n');
  const { fontSize } = state.textConfig;
  const lineHeight = fontSize * 1.2;

  // 使用 canvas 测量文本宽度
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `${fontSize}px ${state.textConfig.fontFamily || 'sans-serif'}`;
  let maxWidth = 4;
  lines.forEach((line) => {
    const w = ctx.measureText(line || '').width;
    if (w > maxWidth) {
      maxWidth = w;
    }
  });

  return {
    width: maxWidth + 16,
    height: Math.max(lineHeight + 8, lines.length * lineHeight + 8),
  };
});

/** 文本输入框创建后自动聚焦 */
watch(() => state.editingTextAnnotation, (val) => {
  if (val) {
    nextTick(() => {
      // 延迟聚焦，确保 mousedown 事件周期结束后再聚焦
      setTimeout(() => {
        if (textInputRef.value) {
          textInputRef.value.focus();
        }
      }, 0);
    });
  }
});

/**
 * 渲染马赛克预览 Canvas
 * 从冻结画面中取出对应区域并进行像素化/模糊处理
 *
 * @param {HTMLCanvasElement|null} el - canvas 元素
 * @param {object} ann - 马赛克标注对象
 */
const renderMosaicCanvas = (el, ann) => {
  if (!el || frozenImages.length === 0) {
    return;
  }

  // 查找覆盖该标注区域的冻结画面
  const globalX = ann.x + state.offsetX;
  const globalY = ann.y + state.offsetY;

  const screen = frozenImages.find((s) => {
    const b = s.bounds;
    return globalX >= b.x && globalY >= b.y
      && globalX < b.x + b.width && globalY < b.y + b.height;
  });

  if (!screen || !screen.img) {
    return;
  }

  const b = screen.bounds;
  // 标注相对于该屏幕的逻辑坐标
  const localX = globalX - b.x;
  const localY = globalY - b.y;
  // 屏幕图像的缩放比例 (图像物理尺寸 / 屏幕逻辑尺寸)
  const imgScaleX = screen.img.naturalWidth / b.width;
  const imgScaleY = screen.img.naturalHeight / b.height;

  // 源图像裁剪坐标
  const sx = localX * imgScaleX;
  const sy = localY * imgScaleY;
  const sw = ann.w * imgScaleX;
  const sh = ann.h * imgScaleY;

  const ctx = el.getContext('2d');

  if (ann.mode === 'blur') {
    // 模糊模式：全尺寸绘制，通过 CSS filter 模糊
    /* eslint-disable no-param-reassign */
    el.width = Math.round(ann.w);
    el.height = Math.round(ann.h);
    /* eslint-enable no-param-reassign */
    ctx.drawImage(screen.img, sx, sy, sw, sh, 0, 0, ann.w, ann.h);
  } else {
    // 像素化模式：缩小绘制，通过 CSS image-rendering: pixelated 放大
    const blockSize = ann.blockSize || 10;
    const smallW = Math.max(1, Math.ceil(ann.w / blockSize));
    const smallH = Math.max(1, Math.ceil(ann.h / blockSize));
    /* eslint-disable no-param-reassign */
    el.width = smallW;
    el.height = smallH;
    /* eslint-enable no-param-reassign */
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(screen.img, sx, sy, sw, sh, 0, 0, smallW, smallH);
  }
};

/** 活动马赛克标注实时预览 */
watch(
  [
    activeAnnotationBounds,
    () => state.activeTool,
    () => state.mosaicConfig.mode,
    () => state.mosaicConfig.blockSize,
  ],
  () => {
    const ann = activeAnnotationBounds.value;
    const el = activeMosaicCanvasRef.value;
    if (!el || !ann || state.activeTool !== 'mosaic' || ann.w <= 0 || ann.h <= 0) {
      return;
    }
    renderMosaicCanvas(el, {
      x: ann.x,
      y: ann.y,
      w: ann.w,
      h: ann.h,
      mode: state.mosaicConfig.mode,
      blockSize: state.mosaicConfig.blockSize,
    });
  },
  { flush: 'post' },
);

// drawingMode 关闭时自动定型活动标注
watch(() => state.drawingMode, (newVal, oldVal) => {
  if (oldVal && !newVal) {
    finalizeAnnotation();
    finalizeTextAnnotation();
    state.activeTool = null;
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

    // 清空标注相关状态
    state.annotations = [];
    state.activeAnnotation = null;
    state.editingTextAnnotation = null;
    state.drawingMode = false;
    state.activeTool = null;
    state.history = [];

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
  finalizeTextAnnotation();

  // 筛选 overlay 类型标注（排除 mosaic，它在主进程处理）
  const overlayAnnotations = state.annotations.filter(
    (ann) => ann.tool !== 'mosaic',
  );

  if (overlayAnnotations.length === 0) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  overlayAnnotations.forEach((ann) => {
    // 转换为选区内部坐标
    const ax = ann.x - originX;
    const ay = ann.y - originY;

    if (ann.tool === 'text') {
      // 渲染文本标注
      ctx.font = `${ann.fontSize}px ${ann.fontFamily || 'sans-serif'}`;
      ctx.fillStyle = ann.color;
      ctx.textBaseline = 'top';

      // 处理多行文本
      const lines = (ann.text || '').split('\n');
      const lineHeight = ann.fontSize * 1.2;
      lines.forEach((line, i) => {
        ctx.fillText(line, ax, ay + i * lineHeight);
      });
    } else if (ann.type === 'stroke') {
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = ann.strokeWidth;
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

  // 收集马赛克区域（相对于选区的逻辑坐标）
  const mosaicAnnotations = state.annotations.filter((ann) => ann.tool === 'mosaic');
  if (mosaicAnnotations.length > 0) {
    rect.mosaicRegions = mosaicAnnotations.map((ann) => ({
      x: ann.x - b.x,
      y: ann.y - b.y,
      w: ann.w,
      h: ann.h,
      mode: ann.mode || 'pixelate',
      blockSize: ann.blockSize || 10,
    }));
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
      // 文本工具：点击放置文本
      if (state.activeTool === 'text') {
        // 先定型当前编辑中的文本
        if (state.editingTextAnnotation) {
          pushHistory();
          finalizeTextAnnotation();
        }
        // 在点击位置创建新的文本编辑
        pushHistory();
        state.editingTextAnnotation = {
          x: mx,
          y: my,
          text: '',
        };
        return;
      }

      // 矩形/马赛克工具：拖拽绘制
      // 定型当前活动标注
      if (state.activeAnnotation) {
        pushHistory();
        finalizeAnnotation();
      }
      // 记录历史并开始绘制新区域
      pushHistory();
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

    // 拖动标注矩形位置
    if (state.isMovingAnnotation && state.activeAnnotation && state.annAtStartMove) {
      const dx = mx - state.annMoveOriginX;
      const dy = my - state.annMoveOriginY;
      state.activeAnnotation.startX = state.annAtStartMove.startX + dx;
      state.activeAnnotation.startY = state.annAtStartMove.startY + dy;
      state.activeAnnotation.endX = state.annAtStartMove.endX + dx;
      state.activeAnnotation.endY = state.annAtStartMove.endY + dy;
      return;
    }

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

    // 标注拖动结束
    if (state.isMovingAnnotation) {
      state.isMovingAnnotation = false;
      state.annAtStartMove = null;
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
  state.activeTool = null;
  state.annotations = [];
  state.activeAnnotation = null;
  state.isDrawingRect = false;
  state.drawingDragged = false;
  state.isResizingAnnotation = false;
  state.annotationResizeDir = null;
  state.editingTextAnnotation = null;
  state.isMovingAnnotation = false;
  state.annAtStartMove = null;
  state.history = [];

  clearBlobUrls();
  state.capturedScreens = [];
  state.allWindows = [];
  state.displays = [];
}

/** Ctrl+Z 快捷键 */
const onKeyDown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undo();
  }
};

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

      // 预加载冻结画面 Image 对象（供马赛克预览使用）
      frozenImages.length = 0;
      state.capturedScreens.forEach((screen) => {
        const img = new Image();
        img.src = screen.url;
        img.decode().then(() => {
          frozenImages.push({ img, bounds: screen.bounds, displayId: screen.displayId });
        }).catch(() => {});
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
  window.addEventListener('keydown', onKeyDown);
});

onUnmounted(() => {
  clearBlobUrls();
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
  window.removeEventListener('keydown', onKeyDown);
});

provide('state', state);
provide('selectionBounds', selectionBounds);
provide('actions', { handleAction, closeOverlay, undo });
provide('utils', { findDisplayAtLocalPoint });

const rootCursor = computed(() => {
  if (state.isResizing && state.resizeDirection) {
    return `${state.resizeDirection}-resize`;
  }
  if (state.isResizingAnnotation && state.annotationResizeDir) {
    return `${state.annotationResizeDir}-resize`;
  }
  if (state.isMovingAnnotation) {
    return 'move';
  }
  if (state.isMoving) {
    return 'move';
  }
  if (state.drawingMode && state.activeTool === 'text') {
    return 'text';
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
      v-if="state.hasSelection && (state.annotations.length > 0 || state.activeAnnotation || state.editingTextAnnotation)"
      class="absolute inset-0 z-20 pointer-events-none"
    >
      <!-- 已定型矩形标注 -->
      <div
        v-for="ann in state.annotations"
        :key="ann.id"
        :style="getAnnotationStyle(ann)"
      />

      <!-- 已定型马赛克标注预览 -->
      <div
        v-for="ann in state.annotations.filter(a => a.tool === 'mosaic')"
        :key="'mosaic-' + ann.id"
        class="mosaic-wrapper"
        :style="{
          position: 'absolute',
          left: ann.x + 'px',
          top: ann.y + 'px',
          width: ann.w + 'px',
          height: ann.h + 'px',
        }"
      >
        <canvas
          :ref="(el) => renderMosaicCanvas(el, ann)"
          class="mosaic-canvas"
          :style="{
            width: '100%',
            height: '100%',
            imageRendering: ann.mode === 'blur' ? 'auto' : 'pixelated',
            filter: ann.mode === 'blur' ? `blur(${Math.max(2, ann.blockSize / 2)}px)` : 'none',
          }"
        />
      </div>

      <!-- 活动马赛克标注实时预览 -->
      <div
        v-if="state.activeTool === 'mosaic' && activeAnnotationBounds && activeAnnotationBounds.w > 0 && activeAnnotationBounds.h > 0"
        class="mosaic-wrapper"
        :style="{
          position: 'absolute',
          left: activeAnnotationBounds.x + 'px',
          top: activeAnnotationBounds.y + 'px',
          width: activeAnnotationBounds.w + 'px',
          height: activeAnnotationBounds.h + 'px',
        }"
      >
        <canvas
          ref="activeMosaicCanvasRef"
          class="mosaic-canvas"
          :style="{
            width: '100%',
            height: '100%',
            imageRendering: state.mosaicConfig.mode === 'blur' ? 'auto' : 'pixelated',
            filter: state.mosaicConfig.mode === 'blur' ? `blur(${Math.max(2, state.mosaicConfig.blockSize / 2)}px)` : 'none',
          }"
        />
      </div>

      <!-- 已定型文本标注 -->
      <div
        v-for="ann in state.annotations.filter(a => a.tool === 'text')"
        :key="'text-' + ann.id"
        class="text-annotation"
        :style="{
          position: 'absolute',
          left: ann.x + 'px',
          top: ann.y + 'px',
          fontSize: ann.fontSize + 'px',
          color: ann.color,
          fontFamily: ann.fontFamily || 'sans-serif',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.2,
        }"
      >
        {{ ann.text }}
      </div>

      <!-- 正在编辑的文本标注 -->
      <textarea
        v-if="state.editingTextAnnotation"
        ref="textInputRef"
        v-model="state.editingTextAnnotation.text"
        class="text-annotation-input pointer-events-auto"
        :style="{
          position: 'absolute',
          left: state.editingTextAnnotation.x + 'px',
          top: state.editingTextAnnotation.y + 'px',
          fontSize: state.textConfig.fontSize + 'px',
          color: state.textConfig.color,
          fontFamily: state.textConfig.fontFamily || 'sans-serif',
          lineHeight: 1.2,
          width: textAreaSize.width + 'px',
          height: textAreaSize.height + 'px',
        }"
        @mousedown.stop
        @keydown.stop
      />

      <!-- 活动标注（可拖动、可调整大小） -->
      <div
        v-if="activeAnnotationBounds && activeAnnotationBounds.w > 0 && activeAnnotationBounds.h > 0"
        :style="activeAnnotationStyle"
      >
        <!-- 拖动区域 -->
        <div
          v-if="!state.isDrawingRect && state.activeAnnotation"
          class="absolute inset-0 cursor-move z-20 pointer-events-auto"
          @mousedown.stop="startAnnotationMove($event)"
        />

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
.mosaic-wrapper {
  pointer-events: none;
  border: 1px dashed rgb(255 255 255 / 50%);
  box-sizing: border-box;
  overflow: hidden;
}

.mosaic-canvas {
  display: block;
  pointer-events: none;
}

.text-annotation {
  user-select: none;
  text-shadow: 0 1px 2px rgb(0 0 0 / 50%);
}

.text-annotation-input {
  background: transparent;
  border: 1px dashed rgb(255 255 255 / 60%);
  outline: none;
  resize: none;
  overflow: hidden;
  padding: 2px 4px;
  text-shadow: 0 1px 2px rgb(0 0 0 / 50%);
  box-sizing: content-box;
}
</style>
