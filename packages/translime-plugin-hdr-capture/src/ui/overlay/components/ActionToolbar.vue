<script setup>
import {
  computed, inject, onMounted, onUnmounted, ref, watch,
} from 'vue';
import SliderControl from './SliderControl.vue';
import ColorPicker from './ColorPicker.vue';
import {
  getDrawingStateForPanelChange,
  getReservedToolbarHeight,
  toggleToolbarPanel,
  TOOLBAR_LAYOUT,
} from '../toolbar-state';

const props = defineProps({
  bounds: {
    type: Object,
    default: () => ({
      x: 0, y: 0, w: 0, h: 0,
    }),
  },
  visible: {
    type: Boolean,
    default: false,
  },
});

const state = inject('state');
const { findDisplayAtLocalPoint } = inject('utils');
const actions = inject('actions');

// ======================== 子菜单面板枚举 ========================
/** 当前展开的子面板名称，null 表示全部关闭 */
const activePanel = ref(null);

/** 当前悬浮提示的文本 */
const hoveredTooltip = ref('');

const MAIN_TOOLBAR_WIDTH = TOOLBAR_LAYOUT.mainWidth;
const TOOLBAR_SPACING = TOOLBAR_LAYOUT.spacing;
const SCREEN_MARGIN = 18;

const dragOffset = ref({ x: 0, y: 0 });
const isDraggingToolbar = ref(false);
const dragStart = ref({
  pointerX: 0,
  pointerY: 0,
  offsetX: 0,
  offsetY: 0,
});
const activeDisplayBounds = ref(null);

/**
 * 切换子面板展开状态（互斥逻辑）
 * @param {'size' | 'radius' | 'rect'} panel - 面板标识
 */
const togglePanel = (panel) => {
  activePanel.value = toggleToolbarPanel(activePanel.value, panel);
};

watch(activePanel, (newVal, oldVal) => {
  const nextState = getDrawingStateForPanelChange(newVal, oldVal);
  if (nextState) {
    state.drawingMode = nextState.drawingMode;
    state.activeTool = nextState.activeTool;
  }
});

// ======================== 尺寸设置 ========================
const widthInput = ref(0);
const heightInput = ref(0);

watch(() => props.bounds, (newBounds) => {
  if (!newBounds) {
    return;
  }
  widthInput.value = Math.round(newBounds.w || 0);
  heightInput.value = Math.round(newBounds.h || 0);
}, { immediate: true });

const applySizeSettings = () => {
  const currentX = Math.min(state.startX, state.endX);
  const currentY = Math.min(state.startY, state.endY);

  const newW = parseInt(widthInput.value, 10) || 0;
  const newH = parseInt(heightInput.value, 10) || 0;

  if (newW <= 0 || newH <= 0) {
    return;
  }

  state.startX = currentX;
  state.startY = currentY;
  state.endX = currentX + newW;
  state.endY = currentY + newH;
};

const handleInputKeydown = (e) => {
  if (e.key === 'Enter') {
    applySizeSettings();
    e.target.blur();
  }
};

// ======================== 圆角设置 ========================
const radiusInput = ref(0);

watch(() => state.borderRadius, (val) => {
  radiusInput.value = val || 0;
}, { immediate: true });

watch(radiusInput, (val) => {
  const r = Math.max(0, Math.min(120, parseInt(val, 10) || 0));
  if (state.borderRadius !== r) {
    state.borderRadius = r;
    localStorage.setItem('translime.hdr-capture.borderRadius', r);
  }
});

// ======================== 矩形工具设置 ========================
/** 矩形类型：'stroke' 边框 | 'fill' 实心 */
const rectType = ref('stroke');
/** 边框粗细 */
const rectStrokeWidth = ref(2);
/** 矩形颜色（RGBA 字符串） */
const rectColor = ref('rgba(255, 0, 0, 1)');

const STORAGE_KEY_PREFIX = 'translime.hdr-capture.rect';

/** 从 localStorage 恢复矩形设置 */
const loadRectSettings = () => {
  const savedType = localStorage.getItem(`${STORAGE_KEY_PREFIX}.type`);
  if (savedType === 'stroke' || savedType === 'fill') {
    rectType.value = savedType;
  }

  const savedWidth = localStorage.getItem(`${STORAGE_KEY_PREFIX}.strokeWidth`);
  if (savedWidth !== null) {
    rectStrokeWidth.value = parseInt(savedWidth, 10) || 2;
  }

  const savedColor = localStorage.getItem(`${STORAGE_KEY_PREFIX}.color`);
  if (savedColor) {
    rectColor.value = savedColor;
  }
};

/** 同步矩形设置到 state.rectConfig 以供绘图系统读取 */
const syncRectConfig = () => {
  state.rectConfig.type = rectType.value;
  state.rectConfig.strokeWidth = rectStrokeWidth.value;
  state.rectConfig.color = rectColor.value;
};

watch(rectType, (val) => {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}.type`, val);
  syncRectConfig();
});

watch(rectStrokeWidth, (val) => {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}.strokeWidth`, val);
  syncRectConfig();
});

watch(rectColor, (val) => {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}.color`, val);
  syncRectConfig();
});

/** 边框粗细滑块是否禁用（实心模式下禁用） */
const isStrokeDisabled = computed(() => rectType.value === 'fill');

// ======================== 马赛克工具设置 ========================
/** 马赛克模式: 'pixelate' | 'blur' */
const mosaicMode = ref('pixelate');
/** 方块大小 / 模糊强度 */
const mosaicBlockSize = ref(10);

const MOSAIC_KEY_PREFIX = 'translime.hdr-capture.mosaic';

/** 同步马赛克设置到 state */
const syncMosaicConfig = () => {
  state.mosaicConfig.mode = mosaicMode.value;
  state.mosaicConfig.blockSize = mosaicBlockSize.value;
};

watch(mosaicMode, (val) => {
  localStorage.setItem(`${MOSAIC_KEY_PREFIX}.mode`, val);
  syncMosaicConfig();
});

watch(mosaicBlockSize, (val) => {
  localStorage.setItem(`${MOSAIC_KEY_PREFIX}.blockSize`, val);
  syncMosaicConfig();
});

/** 从 localStorage 恢复马赛克设置 */
const loadMosaicSettings = () => {
  const savedMode = localStorage.getItem(`${MOSAIC_KEY_PREFIX}.mode`);
  if (savedMode === 'pixelate' || savedMode === 'blur') {
    mosaicMode.value = savedMode;
  }
  const savedSize = localStorage.getItem(`${MOSAIC_KEY_PREFIX}.blockSize`);
  if (savedSize !== null) {
    mosaicBlockSize.value = parseInt(savedSize, 10) || 10;
  }
};

// ======================== 文本工具设置 ========================
/** 文本字号 */
const textFontSize = ref(20);
/** 文本颜色 */
const textColor = ref('rgba(255, 0, 0, 1)');

const TEXT_KEY_PREFIX = 'translime.hdr-capture.text';

/** 同步文本设置到 state */
const syncTextConfig = () => {
  state.textConfig.fontSize = textFontSize.value;
  state.textConfig.color = textColor.value;
};

watch(textFontSize, (val) => {
  localStorage.setItem(`${TEXT_KEY_PREFIX}.fontSize`, val);
  syncTextConfig();
});

watch(textColor, (val) => {
  localStorage.setItem(`${TEXT_KEY_PREFIX}.color`, val);
  syncTextConfig();
});

/** 从 localStorage 恢复文本设置 */
const loadTextSettings = () => {
  const savedSize = localStorage.getItem(`${TEXT_KEY_PREFIX}.fontSize`);
  if (savedSize !== null) {
    textFontSize.value = parseInt(savedSize, 10) || 20;
  }
  const savedColor = localStorage.getItem(`${TEXT_KEY_PREFIX}.color`);
  if (savedColor) {
    textColor.value = savedColor;
  }
};

// ======================== 初始化 ========================
onMounted(() => {
  const savedRadius = localStorage.getItem('translime.hdr-capture.borderRadius');
  if (savedRadius !== null) {
    const r = parseInt(savedRadius, 10) || 0;
    radiusInput.value = r;
    if (state.borderRadius !== r) {
      state.borderRadius = r;
    }
  }

  loadRectSettings();
  syncRectConfig();
  loadMosaicSettings();
  syncMosaicConfig();
  loadTextSettings();
  syncTextConfig();
});

// ======================== 键盘快捷键 ========================
const handleKeydown = (e) => {
  if (e.key === 'Escape') {
    // 优先取消活动标注
    if (state.activeAnnotation) {
      state.activeAnnotation = null;
      e.preventDefault();
      return;
    }

    e.preventDefault();
    actions.handleAction('cancel');
    return;
  }

  if (!props.visible) {
    return;
  }

  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    return;
  }

  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    actions.handleAction('save');
  }

  if (e.ctrlKey && e.key === 'c') {
    e.preventDefault();
    actions.handleAction('copy');
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});

// ======================== 工具栏定位 ========================
const getDisplayBoundsForSelection = () => {
  const {
    x, y, w, h,
  } = props.bounds || {
    x: 0, y: 0, w: 0, h: 0,
  };

  const display = findDisplayAtLocalPoint(x + w / 2, y + h / 2);
  const db = display.bounds;

  return {
    left: db.x - state.offsetX,
    top: db.y - state.offsetY,
    right: db.x + db.width - state.offsetX,
    bottom: db.y + db.height - state.offsetY,
  };
};

const getToolbarFootprintSize = () => {
  return {
    width: MAIN_TOOLBAR_WIDTH,
    height: getReservedToolbarHeight(),
  };
};

const baseToolbarPos = computed(() => {
  const {
    x, y, w, h,
  } = props.bounds || {
    x: 0, y: 0, w: 0, h: 0,
  };
  const displayBounds = getDisplayBoundsForSelection();
  const toolbarSize = getToolbarFootprintSize();

  let left = x + w - toolbarSize.width;
  let top = y + h + TOOLBAR_SPACING;

  if (top + toolbarSize.height + SCREEN_MARGIN > displayBounds.bottom) {
    top = y - toolbarSize.height - TOOLBAR_SPACING;
  }

  if (top < displayBounds.top + SCREEN_MARGIN) {
    top = y + h - toolbarSize.height;
  }

  left = Math.max(
    displayBounds.left + SCREEN_MARGIN,
    Math.min(left, displayBounds.right - toolbarSize.width - SCREEN_MARGIN),
  );
  top = Math.max(
    displayBounds.top + SCREEN_MARGIN,
    Math.min(top, displayBounds.bottom - toolbarSize.height - SCREEN_MARGIN),
  );

  return {
    left,
    top,
    width: toolbarSize.width,
    height: toolbarSize.height,
  };
});

const clampOffset = (offsetX, offsetY) => {
  const displayBounds = activeDisplayBounds.value || getDisplayBoundsForSelection();
  const toolbarSize = getToolbarFootprintSize();
  const base = baseToolbarPos.value;

  const minX = displayBounds.left + SCREEN_MARGIN - base.left;
  const maxX = displayBounds.right - SCREEN_MARGIN - toolbarSize.width - base.left;
  const minY = displayBounds.top + SCREEN_MARGIN - base.top;
  const maxY = displayBounds.bottom - SCREEN_MARGIN - toolbarSize.height - base.top;

  return {
    x: Math.min(Math.max(offsetX, minX), maxX),
    y: Math.min(Math.max(offsetY, minY), maxY),
  };
};

const toolbarPos = computed(() => {
  const base = baseToolbarPos.value;
  const offset = clampOffset(dragOffset.value.x, dragOffset.value.y);
  return {
    left: base.left + offset.x,
    top: base.top + offset.y,
    width: base.width,
    height: base.height,
  };
});

watch(
  () => [props.bounds?.x, props.bounds?.y, props.bounds?.w, props.bounds?.h],
  () => {
    dragOffset.value = clampOffset(dragOffset.value.x, dragOffset.value.y);
  },
  { immediate: true },
);

watch(() => props.visible, (visible) => {
  if (!visible) {
    activeDisplayBounds.value = null;
    isDraggingToolbar.value = false;
  }
});

watch(() => state.isSelecting, (isSelecting, wasSelecting) => {
  if (wasSelecting && !isSelecting && state.hasSelection) {
    dragOffset.value = { x: 0, y: 0 };
    activeDisplayBounds.value = null;
    isDraggingToolbar.value = false;
  }
});

const stopToolbarDrag = () => {
  if (!isDraggingToolbar.value) {
    return;
  }

  isDraggingToolbar.value = false;
  activeDisplayBounds.value = null;
};

const handleToolbarDrag = (e) => {
  if (!isDraggingToolbar.value) {
    return;
  }

  dragOffset.value = clampOffset(
    dragStart.value.offsetX + (e.clientX - dragStart.value.pointerX),
    dragStart.value.offsetY + (e.clientY - dragStart.value.pointerY),
  );
};

const startToolbarDrag = (e) => {
  if (!props.visible) {
    return;
  }

  activeDisplayBounds.value = getDisplayBoundsForSelection();
  isDraggingToolbar.value = true;
  dragStart.value = {
    pointerX: e.clientX,
    pointerY: e.clientY,
    offsetX: dragOffset.value.x,
    offsetY: dragOffset.value.y,
  };
  hoveredTooltip.value = '拖动工具栏';
  e.preventDefault();
};

onMounted(() => {
  window.addEventListener('mousemove', handleToolbarDrag);
  window.addEventListener('mouseup', stopToolbarDrag);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', handleToolbarDrag);
  window.removeEventListener('mouseup', stopToolbarDrag);
});

const toolbarStyle = computed(() => {
  const pos = toolbarPos.value;
  return {
    left: `${pos.left + pos.width}px`,
    top: `${pos.top}px`,
    transform: 'translateX(-100%)',
  };
});

const debugLine = computed(() => {
  if (!state.isDebug || !props.visible) {
    return null;
  }
  const {
    x, y, w, h,
  } = props.bounds;
  const {
    left, top, width, height,
  } = toolbarPos.value;
  return {
    x1: x + w / 2,
    y1: y + h / 2,
    x2: left + width / 2,
    y2: top + height / 2,
  };
});
</script>

<template>
  <Teleport to="body">
    <!-- Debug Line Layer -->
    <svg v-if="state && state.isDebug && debugLine" class="absolute inset-0 w-full h-full pointer-events-none z-99">
      <line
        :x1="debugLine.x1"
        :y1="debugLine.y1"
        :x2="debugLine.x2"
        :y2="debugLine.y2"
        stroke="#FF5252"
        stroke-width="2"
        stroke-dasharray="5,5"
      />
      <circle :cx="debugLine.x1" :cy="debugLine.y1" r="4" fill="#FF5252" />
      <text :x="debugLine.x2" :y="toolbarPos.top - 10" fill="#FF5252" font-size="12">
        {{ Math.round(toolbarPos.left) }}, {{ Math.round(toolbarPos.top) }}
      </text>
    </svg>

    <div
      v-if="state && visible"
      class="action-toolbar-container"
      :style="toolbarStyle"
    >
      <div class="action-toolbar-shell">
        <!-- 主工具栏 -->
        <mat-toolbar
          class="action-toolbar-main"
          :class="{ 'is-dragging': isDraggingToolbar }"
        >
          <div v-if="state.isDebug" class="absolute -top-6 left-0 text-[10px] text-[#FF5252] font-mono whitespace-nowrap">
            Monitor: {{ Math.round(toolbarPos.left) }},{{ Math.round(toolbarPos.top) }}
          </div>

          <!-- 动态提示区域 -->
          <div class="toolbar-tooltip-container" :class="{ 'is-active': hoveredTooltip }">
            <div class="toolbar-tooltip-text">
              {{ hoveredTooltip }}
            </div>
          </div>

          <div class="btn-group">
            <!-- 设置尺寸按钮 -->
            <mat-btn
              class="btn btn-settings"
              variant="standard"
              :class="{ 'active': activePanel === 'size' }"
              aria-label="设置尺寸"
              @mouseenter="hoveredTooltip = '设置尺寸'"
              @mouseleave="hoveredTooltip = ''"
              @click.stop="togglePanel('size')"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M15 3h6v6" />
                <path d="M9 21H3v-6" />
                <path d="M21 3l-7 7" />
                <path d="M3 21l7-7" />
              </svg>
            </mat-btn>

            <!-- 设置圆角按钮 -->
            <mat-btn
              class="btn btn-settings"
              variant="standard"
              :class="{ 'active': activePanel === 'radius' }"
              aria-label="设置圆角"
              @mouseenter="hoveredTooltip = '设置圆角'"
              @mouseleave="hoveredTooltip = ''"
              @click.stop="togglePanel('radius')"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M3 21v-9a9 9 0 0 1 9-9h9" />
              </svg>
            </mat-btn>

            <!-- 矩形工具按钮 -->
            <mat-btn
              class="btn btn-settings"
              variant="standard"
              :class="{ 'active': activePanel === 'rect' }"
              aria-label="矩形工具"
              @mouseenter="hoveredTooltip = '矩形工具'"
              @mouseleave="hoveredTooltip = ''"
              @click.stop="togglePanel('rect')"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="2"
                  ry="2"
                />
              </svg>
            </mat-btn>

            <!-- 马赛克工具按钮 -->
            <mat-btn
              class="btn btn-settings"
              variant="standard"
              :class="{ 'active': activePanel === 'mosaic' }"
              aria-label="马赛克/模糊"
              @mouseenter="hoveredTooltip = '马赛克/模糊'"
              @mouseleave="hoveredTooltip = ''"
              @click.stop="togglePanel('mosaic')"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="none"
              >
                <rect x="2" y="2" width="5" height="5" />
                <rect x="9" y="2" width="5" height="5" opacity="0.6" />
                <rect x="16" y="2" width="5" height="5" />
                <rect x="2" y="9" width="5" height="5" opacity="0.6" />
                <rect x="9" y="9" width="5" height="5" />
                <rect x="16" y="9" width="5" height="5" opacity="0.6" />
                <rect x="2" y="16" width="5" height="5" />
                <rect x="9" y="16" width="5" height="5" opacity="0.6" />
                <rect x="16" y="16" width="5" height="5" />
              </svg>
            </mat-btn>

            <!-- 文本工具按钮 -->
            <mat-btn
              class="btn btn-settings"
              variant="standard"
              :class="{ 'active': activePanel === 'text' }"
              aria-label="文本标注"
              @mouseenter="hoveredTooltip = '文本标注'"
              @mouseleave="hoveredTooltip = ''"
              @click.stop="togglePanel('text')"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="4 7 4 4 20 4 20 7" />
                <line x1="9" y1="20" x2="15" y2="20" />
                <line x1="12" y1="4" x2="12" y2="20" />
              </svg>
            </mat-btn>

            <div class="divider" />

            <!-- 撤销按钮 -->
            <mat-btn
              class="btn btn-settings"
              variant="standard"
              :disabled="state.history.length === 0"
              aria-label="撤销 (Ctrl+Z)"
              @mouseenter="hoveredTooltip = '撤销 (Ctrl+Z)'"
              @mouseleave="hoveredTooltip = ''"
              @click.stop="actions.undo()"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </mat-btn>

            <!-- 功能按钮 -->
            <mat-btn
              class="btn btn-save"
              variant="standard"
              aria-label="保存 (Ctrl+S)"
              @mouseenter="hoveredTooltip = '保存 (Ctrl+S)'"
              @mouseleave="hoveredTooltip = ''"
              @click.stop="actions.handleAction('save')"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
            </mat-btn>

            <mat-btn
              class="btn btn-copy"
              variant="standard"
              aria-label="复制 (Ctrl+C)"
              @mouseenter="hoveredTooltip = '复制 (Ctrl+C)'"
              @mouseleave="hoveredTooltip = ''"
              @click.stop="actions.handleAction('copy')"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect
                  x="9"
                  y="9"
                  width="13"
                  height="13"
                  rx="2"
                  ry="2"
                />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </mat-btn>

            <mat-btn
              class="btn btn-cancel"
              variant="standard"
              aria-label="取消 (Esc)"
              @mouseenter="hoveredTooltip = '取消 (Esc)'"
              @mouseleave="hoveredTooltip = ''"
              @click.stop="actions.handleAction('cancel')"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </mat-btn>
          </div>

          <button
            class="toolbar-drag-handle"
            title="拖动工具栏"
            aria-label="拖动工具栏"
            @mouseenter="hoveredTooltip = '拖动工具栏'"
            @mouseleave="hoveredTooltip = ''"
            @mousedown.stop.prevent="startToolbarDrag"
          >
            <span class="drag-dots">
              <span v-for="dot in 6" :key="dot" class="drag-dot" />
            </span>
          </button>
        </mat-toolbar>
      </div>

      <!-- 尺寸设置栏 -->
      <div v-if="activePanel === 'size'" class="sub-panel">
        <div class="size-inputs">
          <input
            v-model="widthInput"
            type="number"
            class="size-input"
            :style="{ width: `calc(${Math.max(4, String(widthInput).length)}ch + 12px)` }"
            @keydown="handleInputKeydown"
            @mousedown.stop
          >

          <span class="size-separator">x</span>

          <input
            v-model="heightInput"
            type="number"
            class="size-input"
            :style="{ width: `calc(${Math.max(4, String(heightInput).length)}ch + 12px)` }"
            @keydown="handleInputKeydown"
            @mousedown.stop
          >

          <span class="size-unit">px</span>
        </div>

        <button class="btn-confirm" @click.stop="applySizeSettings">
          确定
        </button>
      </div>

      <!-- 圆角设置栏 -->
      <div v-if="activePanel === 'radius'" class="sub-panel sub-panel--slider">
        <div class="sub-panel__row">
          <span class="sub-panel__label">圆角:</span>

          <SliderControl
            v-model="radiusInput"
            :min="0"
            :max="120"
            :step="1"
            unit="px"
            input-width="50px"
          />
        </div>
      </div>

      <!-- 矩形工具设置栏（横向排列） -->
      <div v-if="activePanel === 'rect'" class="sub-panel sub-panel--extended">
        <!-- 类型切换 -->
        <div class="rect-type-toggle">
          <button
            class="rect-type-btn"
            :class="{ 'rect-type-btn--active': rectType === 'stroke' }"
            title="边框矩形"
            @click.stop="rectType = 'stroke'"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <rect
                x="3"
                y="3"
                width="18"
                height="18"
                rx="1"
                ry="1"
              />
            </svg>
          </button>

          <button
            class="rect-type-btn"
            :class="{ 'rect-type-btn--active': rectType === 'fill' }"
            title="实心矩形"
            @click.stop="rectType = 'fill'"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="none"
            >
              <rect
                x="3"
                y="3"
                width="18"
                height="18"
                rx="1"
                ry="1"
              />
            </svg>
          </button>
        </div>

        <div class="sub-divider" />

        <!-- 边框粗细 -->
        <SliderControl
          v-model="rectStrokeWidth"
          :min="1"
          :max="20"
          :step="1"
          :disabled="isStrokeDisabled"
          unit=""
          input-width="32px"
        />

        <div class="sub-divider" />

        <!-- 颜色选择 -->
        <ColorPicker
          v-model="rectColor"
          :enable-alpha="true"
        />
      </div>

      <!-- 马赛克工具设置栏 -->
      <div v-if="activePanel === 'mosaic'" class="sub-panel sub-panel--slider">
        <!-- 模式切换 -->
        <div class="rect-type-toggle">
          <button
            class="rect-type-btn"
            :class="{ 'rect-type-btn--active': mosaicMode === 'pixelate' }"
            title="马赛克"
            @click.stop="mosaicMode = 'pixelate'"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="none"
            >
              <rect x="2" y="2" width="5" height="5" />
              <rect x="9" y="9" width="5" height="5" />
              <rect x="16" y="16" width="5" height="5" />
            </svg>
          </button>

          <button
            class="rect-type-btn"
            :class="{ 'rect-type-btn--active': mosaicMode === 'blur' }"
            title="模糊"
            @click.stop="mosaicMode = 'blur'"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" opacity="0.3" />
              <circle cx="12" cy="12" r="6" opacity="0.6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
          </button>
        </div>

        <div class="sub-divider" />

        <!-- 方块大小 / 模糊强度 -->
        <span class="sub-panel__label">{{ mosaicMode === 'blur' ? '强度' : '方块' }}:</span>
        <SliderControl
          v-model="mosaicBlockSize"
          :min="2"
          :max="50"
          :step="1"
          unit=""
          input-width="36px"
        />
      </div>

      <!-- 文本工具设置栏 -->
      <div v-if="activePanel === 'text'" class="sub-panel sub-panel--extended">
        <span class="sub-panel__label">字号:</span>
        <SliderControl
          v-model="textFontSize"
          :min="8"
          :max="72"
          :step="1"
          unit=""
          input-width="36px"
        />

        <div class="sub-divider" />

        <ColorPicker
          v-model="textColor"
          :enable-alpha="true"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.action-toolbar-container {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 14px;
  z-index: 100;
  pointer-events: none;
}

.action-toolbar-shell {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 14px;
}

:deep(.mat-toolbar.action-toolbar-main),
.action-toolbar-main {
  position: relative !important;
  inset: auto !important;
  translate: none !important;
  inline-size: auto !important;
  max-inline-size: none !important;
  background: transparent !important;
  box-shadow: none !important;
  padding: 0 !important;
  border: none !important;
  z-index: 1;
}

:deep(.mat-toolbar.action-toolbar-main .mat-toolbar__surface) {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 444px;
  min-height: 68px;
  padding: 8px 10px 8px 18px;
  background: var(--mat-sys-color-surface-container-high, rgb(28 27 31 / 88%));
  border-radius: 999px;
  box-shadow: 0 6px 20px rgb(0 0 0 / 28%);
  backdrop-filter: blur(18px) saturate(130%);
  border: 1px solid var(--mat-sys-color-outline-variant, rgb(255 255 255 / 7%));
  pointer-events: auto;
  transition: box-shadow .2s cubic-bezier(.2, 0, 0, 1), background .2s cubic-bezier(.2, 0, 0, 1), border-color .2s cubic-bezier(.2, 0, 0, 1);
  box-sizing: border-box;
}

:deep(.mat-toolbar.action-toolbar-main.is-dragging .mat-toolbar__surface) {
  cursor: grabbing;
  box-shadow: 0 10px 28px rgb(0 0 0 / 34%);
}

.toolbar-tooltip-container {
  max-width: 148px;
  min-width: 0;
  opacity: .72;
  overflow: hidden;
  pointer-events: none;
  transition: max-width .3s cubic-bezier(.4, 0, .2, 1), opacity .2s ease;
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.toolbar-tooltip-container.is-active {
  max-width: 148px;
  opacity: 1;
}

.toolbar-tooltip-text {
  font-size: 12px;
  color: var(--mat-sys-color-on-surface-variant, rgb(232 224 233 / 82%));
  padding: 0 12px 0 0;
  font-weight: 500;
  letter-spacing: .01em;
}

:deep(.mat-toolbar.action-toolbar-main .mat-toolbar__content) {
  display: flex;
  align-items: center;
  gap: 0;
  width: 100%;
}

.btn-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

:deep(.mat-btn.btn),
.btn {
  width: 38px;
  height: 38px;
  min-width: 38px;
  min-height: 38px;
  max-width: 38px;
  max-height: 38px;
  padding: 0 !important;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--mat-sys-color-on-surface, rgb(232 224 233 / 86%));
  transition: background-color .2s cubic-bezier(.2, 0, 0, 1), color .2s cubic-bezier(.2, 0, 0, 1), opacity .2s cubic-bezier(.2, 0, 0, 1);
  background: transparent;
  border-radius: 999px;
  flex-shrink: 0;
}

:deep(.mat-btn.btn:hover),
.btn:hover {
  background: var(--mat-sys-color-surface-container-highest, rgb(232 224 233 / 8%));
  color: var(--mat-sys-color-on-surface, rgb(255 251 254 / 96%));
}

:deep(.mat-btn.btn:active),
.btn:active {
  background: var(--mat-sys-color-surface-container-highest, rgb(232 224 233 / 12%));
}

:deep(.mat-btn.btn.active),
.btn.active {
  background: var(--mat-sys-color-primary-container, rgb(79 55 139 / 28%));
  color: var(--mat-sys-color-on-primary-container, rgb(210 194 255 / 98%));
}

:deep(.mat-btn.btn:disabled),
.btn:disabled {
  opacity: .38;
  cursor: not-allowed;
  color: var(--mat-sys-color-on-surface);
}

.divider {
  width: 1px;
  height: 24px;
  background: var(--mat-sys-color-outline-variant, rgb(202 196 208 / 22%));
  margin: 0 6px;
}

.sub-divider {
  width: 1px;
  height: 18px;
  background: var(--mat-sys-color-outline-variant, rgb(255 255 255 / 15%));
  flex-shrink: 0;
}

:deep(.mat-btn.btn-save:hover) { background: color-mix(in srgb, var(--mat-sys-color-primary, rgb(103 80 164)) 22%, transparent); }

:deep(.mat-btn.btn-copy:hover) { background: color-mix(in srgb, var(--mat-sys-color-primary, rgb(103 80 164)) 22%, transparent); }

:deep(.mat-btn.btn-cancel:hover) {
  background: color-mix(in srgb, var(--mat-sys-color-error, rgb(140 29 24)) 25%, transparent);
  color: var(--mat-sys-color-error, rgb(255 180 171 / 96%));
}

.toolbar-drag-handle {
  width: 42px;
  height: 42px;
  margin-left: 2px;
  border: none;
  border-radius: 999px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  color: var(--mat-sys-color-on-surface-variant);
  transition: background-color .2s cubic-bezier(.2, 0, 0, 1), color .2s cubic-bezier(.2, 0, 0, 1), border-color .2s cubic-bezier(.2, 0, 0, 1);
}

.toolbar-drag-handle:hover {
  color: var(--mat-sys-color-on-surface);
  background: var(--mat-sys-color-surface-container-highest);
}

.toolbar-drag-handle:active {
  cursor: grabbing;
  background: var(--mat-sys-color-surface-container-highest);
  color: var(--mat-sys-color-on-surface);
}

.drag-dots {
  display: grid;
  grid-template-columns: repeat(2, 4px);
  grid-auto-rows: 4px;
  gap: 3px;
}

.drag-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentcolor;
  opacity: 1;
}

/* 通用子面板 */
.sub-panel {
  padding: 10px 16px;
  background: var(--mat-sys-color-surface-container-high, rgb(28 27 31 / 88%));
  border-radius: 999px;
  box-shadow: 0 6px 20px rgb(0 0 0 / 28%);
  backdrop-filter: blur(18px) saturate(130%);
  border: 1px solid var(--mat-sys-color-outline-variant, rgb(255 255 255 / 7%));
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  box-sizing: border-box;
  max-width: 444px;
}

.sub-panel--slider {
  min-width: 320px;
}

.sub-panel--extended {
  min-width: 390px;
}

.sub-panel__row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.sub-panel__row .slider-control,
.sub-panel > .slider-control {
  flex: 1;
  min-width: 0;
}

.sub-panel__label {
  font-size: 13px;
  color: var(--mat-sys-color-on-surface);
  white-space: nowrap;
  font-weight: 500;
}

.size-inputs {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: monospace;
  font-size: 13px;
}

.size-input {
  background: var(--mat-sys-color-surface-container-highest);
  border: 1px solid var(--mat-sys-color-outline-variant);
  border-radius: 999px;
  color: var(--mat-sys-color-on-surface);
  padding: 2px 8px;
  text-align: center;
  outline: none;
  font-family: inherit;
  font-size: inherit;
  font-weight: 500;
  min-width: 4ch;
  height: 24px;
  box-sizing: border-box;
  transition: border-color .2s, background-color .2s;
}

.size-input:focus {
  border-color: var(--mat-sys-color-primary, #2196f3);
  background: var(--mat-sys-color-surface, #fff);
  box-shadow: 0 0 0 1px var(--mat-sys-color-primary, #2196f3);
}

.size-input::-webkit-outer-spin-button,
.size-input::-webkit-inner-spin-button {
  appearance: none;
  margin: 0;
}

.size-separator {
  color: var(--mat-sys-color-on-surface-variant);
  font-size: 12px;
  font-weight: 500;
}

.size-unit {
  color: var(--mat-sys-color-on-surface-variant);
  font-size: 12px;
  font-weight: 500;
  margin-left: 2px;
}

.btn-confirm {
  border: 1px solid transparent;
  background: var(--mat-sys-color-primary, rgb(103 80 164 / 92%));
  color: var(--mat-sys-color-on-primary, rgb(255 251 254 / 96%));
  border-radius: 999px;
  padding: 2px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  height: 26px;
  line-height: 20px;
  transition: background-color .2s cubic-bezier(.2, 0, 0, 1), color .2s cubic-bezier(.2, 0, 0, 1);
  white-space: nowrap;
}

.btn-confirm:hover {
  background: color-mix(in srgb, var(--mat-sys-color-primary, rgb(117 92 184)) 85%, white);
}

.btn-confirm:active { background: color-mix(in srgb, var(--mat-sys-color-primary, rgb(90 69 145)) 85%, black); }

/* 矩形类型切换 */
.rect-type-toggle {
  display: flex;
  gap: 2px;
  background: var(--mat-sys-color-surface-container-highest);
  border: 1px solid var(--mat-sys-color-outline-variant);
  border-radius: 999px;
  padding: 2px;
  flex-shrink: 0;
}

.rect-type-btn {
  width: 28px;
  height: 26px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mat-sys-color-on-surface-variant);
  background: transparent;
  border-radius: 999px;
  transition: background-color .2s cubic-bezier(.2, 0, 0, 1), color .2s cubic-bezier(.2, 0, 0, 1);
}

.rect-type-btn:hover {
  color: var(--mat-sys-color-on-surface);
  background: var(--mat-sys-color-surface-container);
}

.rect-type-btn--active {
  color: var(--mat-sys-color-on-primary-container);
  background: var(--mat-sys-color-primary-container);
}
</style>

