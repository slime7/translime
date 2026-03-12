<script setup>
import {
  computed, inject, onMounted, onUnmounted, ref, watch,
} from 'vue';
import SliderControl from './SliderControl.vue';
import ColorPicker from './ColorPicker.vue';

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

/**
 * 切换子面板展开状态（互斥逻辑）
 * @param {'size' | 'radius' | 'rect'} panel - 面板标识
 */
const togglePanel = (panel) => {
  activePanel.value = activePanel.value === panel ? null : panel;
};

// 监听面板切换，同步绘图模式与工具类型
const DRAWING_PANELS = ['rect', 'mosaic', 'text'];

watch(activePanel, (newVal, oldVal) => {
  if (DRAWING_PANELS.includes(newVal)) {
    state.drawingMode = true;
    state.activeTool = newVal;
  } else if (DRAWING_PANELS.includes(oldVal)) {
    state.drawingMode = false;
    state.activeTool = null;
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
const toolbarPos = computed(() => {
  const {
    x, y, w, h,
  } = props.bounds || {
    x: 0, y: 0, w: 0, h: 0,
  };

  const tbWidth = 170;
  const tbHeight = 76;
  const spacing = 8;
  const margin = 12;

  const display = findDisplayAtLocalPoint(x + w / 2, y + h / 2);
  const db = display.bounds;

  const localDb = {
    left: db.x - state.offsetX,
    top: db.y - state.offsetY,
    right: db.x + db.width - state.offsetX,
    bottom: db.y + db.height - state.offsetY,
  };

  let left = x + w - tbWidth;
  let top = y + h + spacing;

  if (top + tbHeight + margin > localDb.bottom) {
    top = y - tbHeight - spacing;
    if (top < localDb.top + margin) {
      top = y + h - tbHeight - margin - 10;
      left = x + w - tbWidth - margin - 10;
    }
  }

  left = Math.max(localDb.left + margin, Math.min(left, localDb.right - tbWidth - margin));
  top = Math.max(localDb.top + margin, Math.min(top, localDb.bottom - tbHeight - margin));

  return {
    left, top, tbWidth, tbHeight,
  };
});

const toolbarStyle = computed(() => {
  const pos = toolbarPos.value;
  return {
    left: `${pos.left + pos.tbWidth}px`,
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
    left, top, tbWidth, tbHeight,
  } = toolbarPos.value;
  return {
    x1: x + w / 2,
    y1: y + h / 2,
    x2: left + tbWidth / 2,
    y2: top + tbHeight / 2,
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
      <!-- 主工具栏 -->
      <div class="action-toolbar-main">
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
          <button
            class="btn btn-settings"
            :class="{ 'active': activePanel === 'size' }"
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
          </button>

          <!-- 设置圆角按钮 -->
          <button
            class="btn btn-settings"
            :class="{ 'active': activePanel === 'radius' }"
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
          </button>

          <!-- 矩形工具按钮 -->
          <button
            class="btn btn-settings"
            :class="{ 'active': activePanel === 'rect' }"
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
          </button>

          <!-- 马赛克工具按钮 -->
          <button
            class="btn btn-settings"
            :class="{ 'active': activePanel === 'mosaic' }"
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
          </button>

          <!-- 文本工具按钮 -->
          <button
            class="btn btn-settings"
            :class="{ 'active': activePanel === 'text' }"
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
          </button>

          <div class="divider" />

          <!-- 撤销按钮 -->
          <button
            class="btn btn-settings"
            :disabled="state.history.length === 0"
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
          </button>

          <!-- 功能按钮 -->
          <button
            class="btn btn-save"
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
          </button>

          <button
            class="btn btn-copy"
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
          </button>

          <button
            class="btn btn-cancel"
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
          </button>
        </div>
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
      <div v-if="activePanel === 'radius'" class="sub-panel">
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
      <div v-if="activePanel === 'rect'" class="sub-panel">
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
      <div v-if="activePanel === 'mosaic'" class="sub-panel">
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
      <div v-if="activePanel === 'text'" class="sub-panel">
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
  z-index: 100;
  pointer-events: none;
}

.action-toolbar-main {
  display: flex;
  padding: 4px;
  background: rgb(30 30 30 / 95%);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgb(0 0 0 / 40%);
  backdrop-filter: blur(12px);
  border: 1px solid rgb(255 255 255 / 10%);
  pointer-events: auto;
  transition: all .3s cubic-bezier(.4, 0, .2, 1);
}

.toolbar-tooltip-container {
  max-width: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
  transition: max-width .3s cubic-bezier(.4, 0, .2, 1), opacity .2s ease;
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.toolbar-tooltip-container.is-active {
  max-width: 150px;
  opacity: 1;
}

.toolbar-tooltip-text {
  font-size: 12px;
  color: rgb(255 255 255 / 90%);
  padding: 0 8px 0 6px;
  font-weight: 500;
}

.btn-group {
  display: flex;
  align-items: center;
}

.btn {
  width: 28px;
  height: 28px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  transition: all .15s ease;
  background: transparent;
  border-radius: 4px;
  margin: 0 1px;
}

.btn:hover { background: rgb(255 255 255 / 15%); }

.btn:active { transform: scale(.95); }

.btn.active {
  background: rgb(255 255 255 / 25%);
  color: #adf;
}

.divider {
  width: 1px;
  height: 16px;
  background: rgb(255 255 255 / 20%);
  margin: 0 4px;
}

.sub-divider {
  width: 1px;
  height: 18px;
  background: rgb(255 255 255 / 15%);
  flex-shrink: 0;
}

.btn-save:hover { background: rgb(76 175 80 / 60%); }

.btn-copy:hover { background: rgb(33 150 243 / 60%); }

.btn-cancel:hover { background: rgb(244 67 54 / 60%); }

/* 通用子面板 */
.sub-panel {
  margin-top: 4px;
  padding: 4px 8px;
  background: rgb(30 30 30 / 95%);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgb(0 0 0 / 40%);
  backdrop-filter: blur(12px);
  border: 1px solid rgb(255 255 255 / 10%);
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  box-sizing: border-box;
}

.sub-panel__row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.sub-panel__label {
  font-size: 12px;
  color: rgb(255 255 255 / 70%);
  white-space: nowrap;
}

.size-inputs {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: monospace;
  font-size: 13px;
  color: #eee;
}

.size-input {
  background: rgb(0 0 0 / 30%);
  border: 1px solid rgb(255 255 255 / 20%);
  border-radius: 4px;
  color: white;
  padding: 2px 4px;
  text-align: center;
  outline: none;
  font-family: inherit;
  font-size: inherit;
  min-width: 4ch;
  height: 22px;
  box-sizing: border-box;
}

.size-input:focus {
  border-color: #2196f3;
  background: rgb(0 0 0 / 50%);
}

.size-input::-webkit-outer-spin-button,
.size-input::-webkit-inner-spin-button {
  appearance: none;
  margin: 0;
}

.size-separator {
  color: rgb(255 255 255 / 50%);
  font-size: 12px;
}

.size-unit {
  color: rgb(255 255 255 / 50%);
  font-size: 12px;
  margin-left: 2px;
}

.btn-confirm {
  border: none;
  background: #2196f3;
  color: white;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
  height: 22px;
  line-height: 18px;
  transition: background .15s;
  white-space: nowrap;
}

.btn-confirm:hover { background: #42a5f5; }

.btn-confirm:active { background: #1976d2; }

/* 矩形类型切换 */
.rect-type-toggle {
  display: flex;
  gap: 2px;
  background: rgb(255 255 255 / 8%);
  border-radius: 4px;
  padding: 2px;
  flex-shrink: 0;
}

.rect-type-btn {
  width: 24px;
  height: 22px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgb(255 255 255 / 60%);
  background: transparent;
  border-radius: 3px;
  transition: all .15s ease;
}

.rect-type-btn:hover {
  color: white;
  background: rgb(255 255 255 / 12%);
}

.rect-type-btn--active {
  color: #adf;
  background: rgb(255 255 255 / 20%);
}
</style>
