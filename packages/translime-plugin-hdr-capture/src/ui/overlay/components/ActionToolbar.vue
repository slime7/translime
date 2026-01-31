<script setup>
import {
  computed, inject, onMounted, onUnmounted, ref, watch,
} from 'vue';

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

// 尺寸设置相关状态
const showSizeSettings = ref(false);
const widthInput = ref(0);
const heightInput = ref(0);

// 监听选区变化，同步到输入框
watch(() => props.bounds, (newBounds) => {
  if (!newBounds) return;
  // 只有在没有手动输入的情况下才自动更新，或者在刚打开时更新
  // 为了简化体验，每次选区变化都更新输入框
  widthInput.value = Math.round(newBounds.w || 0);
  heightInput.value = Math.round(newBounds.h || 0);
}, { immediate: true });

const toggleSizeSettings = () => {
  showSizeSettings.value = !showSizeSettings.value;
  if (showSizeSettings.value && props.bounds) {
    // 重新从 bounds 获取一次，确保是最新的
    widthInput.value = Math.round(props.bounds.w || 0);
    heightInput.value = Math.round(props.bounds.h || 0);
  }
};

const applySizeSettings = () => {
  // 计算新的 endX 和 endY (假设 start 不动，改变 end)
  // state.startX / startY 保持不变
  // 新的宽高需要应用到 state.endX / endY

  const currentX = Math.min(state.startX, state.endX);
  const currentY = Math.min(state.startY, state.endY);

  const newW = parseInt(widthInput.value, 10) || 0;
  const newH = parseInt(heightInput.value, 10) || 0;

  if (newW <= 0 || newH <= 0) return;

  // 更新 state
  // 这里的策略是：强制重置 start 为左上角，end 为右下角
  state.startX = currentX;
  state.startY = currentY;
  state.endX = currentX + newW;
  state.endY = currentY + newH;
};

const handleInputKeydown = (e) => {
  if (e.key === 'Enter') {
    applySizeSettings();
    e.target.blur(); // 确认后失去焦点
  }
};

// 键盘快捷键处理
const handleKeydown = (e) => {
  // Esc 取消 (全局有效，用于关闭截图或清除选区)
  if (e.key === 'Escape') {
    // 如果正在输入尺寸，先关闭尺寸栏或失去焦点
    if (showSizeSettings.value) {
      showSizeSettings.value = false;
      e.preventDefault();
      return;
    }

    e.preventDefault();
    actions.handleAction('cancel');
    return;
  }

  // 其他快捷键仅在工具栏可见时生效
  if (!props.visible) return;

  // 避免在输入框中打字时触发快捷键
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

  // Ctrl+S 保存
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    actions.handleAction('save');
  }
  // Ctrl+C 复制
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

const toolbarPos = computed(() => {
  const {
    x, y, w, h,
  } = props.bounds || {
    x: 0, y: 0, w: 0, h: 0,
  };

  // 基础工具栏尺寸
  const tbWidth = 140;
  let tbHeight = 36;

  // 如果显示尺寸设置栏，高度增加
  if (showSizeSettings.value) {
    tbHeight += 40;
  }

  const spacing = 8;
  const margin = 12;

  // 找出选区中心所在的显示器
  const display = findDisplayAtLocalPoint(x + w / 2, y + h / 2);
  const db = display.bounds;

  // 显示器在本地坐标系下的边界
  const localDb = {
    left: db.x - state.offsetX,
    top: db.y - state.offsetY,
    right: db.x + db.width - state.offsetX,
    bottom: db.y + db.height - state.offsetY,
  };

  // 1. 尝试放在选区右下角外侧
  let left = x + w - tbWidth;
  let top = y + h + spacing;

  // 2. 检查下方是否超出该显示器边界
  if (top + tbHeight + margin > localDb.bottom) {
    // 3. 尝试放在选区右上角外侧
    top = y - tbHeight - spacing;

    // 4. 如果上方也放不下 (选区太高)
    if (top < localDb.top + margin) {
      // 5. 放在选区内部的右下角
      top = y + h - tbHeight - margin - 10;
      left = x + w - tbWidth - margin - 10;
    }
  }

  // 安全钳制：确保不超出该显示器
  left = Math.max(localDb.left + margin, Math.min(left, localDb.right - tbWidth - margin));
  top = Math.max(localDb.top + margin, Math.min(top, localDb.bottom - tbHeight - margin));

  return {
    left, top, tbWidth, tbHeight,
  };
});

const toolbarStyle = computed(() => {
  const pos = toolbarPos.value;
  // 使用 transform: translateX(-100%) 技巧
  // 将 left 设为工具栏的目标右边缘 (left + width)
  // 这样无论容器实际宽度是多少，都会以这个右边缘为锚点向左延伸
  // 从而保证主工具栏（右对齐）的位置视觉上固定不变
  return {
    left: `${pos.left + pos.tbWidth}px`,
    top: `${pos.top}px`,
    transform: 'translateX(-100%)',
  };
});

// Debug 直线
const debugLine = computed(() => {
  if (!state.isDebug || !props.visible) return null;
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

        <!-- 按钮组 -->
        <div class="btn-group">
          <!-- 设置尺寸按钮 (左侧) -->
          <button
            class="btn btn-settings"
            :class="{ 'active': showSizeSettings }"
            title="设置尺寸"
            @click.stop="toggleSizeSettings"
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

          <!-- 分割线 -->
          <div class="divider" />

          <!-- 功能按钮 (右侧) -->
          <button
            class="btn btn-save"
            title="保存 (Ctrl+S)"
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
            title="复制 (Ctrl+C)"
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
            title="取消 (Esc)"
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
      <div v-if="showSizeSettings" class="size-settings-bar">
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
    </div>
  </Teleport>
</template>

<style scoped>
.action-toolbar-container {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: flex-end; /* 右对齐 */
  z-index: 100;
  pointer-events: none; /* 容器透传点击，内部元素 auto */
}

/* 主操作栏 */
.action-toolbar-main {
  display: flex;
  padding: 4px;
  background: rgb(30 30 30 / 95%);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgb(0 0 0 / 40%);
  backdrop-filter: blur(12px);
  border: 1px solid rgb(255 255 255 / 10%);
  pointer-events: auto;
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

.btn:hover {
  background: rgb(255 255 255 / 15%);
}

.btn:active {
  transform: scale(.95);
}

.btn.active {
  background: rgb(255 255 255 / 25%);
  color: #adf;
}

/* 显式分割线 */
.divider {
  width: 1px;
  height: 16px;
  background: rgb(255 255 255 / 20%);
  margin: 0 4px;
}

/* 特定颜色悬停 */
.btn-save:hover { background: rgb(76 175 80 / 60%); }

.btn-copy:hover { background: rgb(33 150 243 / 60%); }

.btn-cancel:hover { background: rgb(244 67 54 / 60%); }

/* 尺寸设置栏 */
.size-settings-bar {
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
  height: 36px;
  box-sizing: border-box;
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

/* 移除数字输入框的箭头 */
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
}

.btn-confirm:hover {
  background: #42a5f5;
}

.btn-confirm:active {
  background: #1976d2;
}
</style>
