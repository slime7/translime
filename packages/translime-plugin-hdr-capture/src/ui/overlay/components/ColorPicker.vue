<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  /** 当前颜色值，格式为 rgba(r, g, b, a) 或 #RRGGBB */
  modelValue: {
    type: String,
    default: '#FF0000',
  },
  /** 是否支持透明通道 */
  enableAlpha: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(['update:modelValue']);

const colorInputRef = ref(null);

/**
 * 将颜色字符串解析为 hex + alpha 分量
 * @param {string} color - 颜色值
 * @returns {{ hex: string, alpha: number }}
 */
const parseColor = (color) => {
  const rgbaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10);
    const g = parseInt(rgbaMatch[2], 10);
    const b = parseInt(rgbaMatch[3], 10);
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    return { hex, alpha: Math.round(a * 100) };
  }

  if (color.length === 9 && color.startsWith('#')) {
    const hex = color.substring(0, 7);
    const alphaHex = color.substring(7, 9);
    const alpha = Math.round((parseInt(alphaHex, 16) / 255) * 100);
    return { hex, alpha };
  }

  if (color.length === 7 && color.startsWith('#')) {
    return { hex: color, alpha: 100 };
  }

  return { hex: '#FF0000', alpha: 100 };
};

const parsed = computed(() => parseColor(props.modelValue));

/**
 * 构建 RGBA 字符串
 * @param {string} hex - 16 进制颜色
 * @param {number} alphaPercent - 透明度百分比 (0-100)
 * @returns {string}
 */
const buildRgba = (hex, alphaPercent) => {
  const r = parseInt(hex.substring(1, 3), 16);
  const g = parseInt(hex.substring(3, 5), 16);
  const b = parseInt(hex.substring(5, 7), 16);
  const a = alphaPercent / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/** 颜色变化时触发 */
const onColorChange = (e) => {
  const newHex = e.target.value;
  if (props.enableAlpha) {
    emit('update:modelValue', buildRgba(newHex, parsed.value.alpha));
  } else {
    emit('update:modelValue', newHex);
  }
};

/** 透明度滑块更新 */
const onAlphaSliderUpdate = (val) => {
  const newAlpha = parseInt(val, 10) || 0;
  emit('update:modelValue', buildRgba(parsed.value.hex, newAlpha));
};

/** 透明度滑块上的滚轮调节 */
const onAlphaWheel = (e) => {
  e.preventDefault();
  e.stopPropagation();
  const direction = e.deltaY > 0 ? -5 : 5;
  const newAlpha = Math.max(0, Math.min(100, parsed.value.alpha + direction));
  emit('update:modelValue', buildRgba(parsed.value.hex, newAlpha));
};

/** 直接触发隐藏的原生取色器 */
const openNativeColorPicker = () => {
  colorInputRef.value?.click();
};

/** 预览色块的背景样式 */
const previewStyle = computed(() => ({
  background: props.modelValue,
}));
</script>

<template>
  <div class="color-picker" @mousedown.stop>
    <!-- 颜色预览按钮：点击直接打开原生取色器 -->
    <button
      class="color-picker__preview"
      title="选择颜色"
      @click.stop="openNativeColorPicker"
    >
      <span class="color-picker__checker" />
      <span class="color-picker__swatch" :style="previewStyle" />
    </button>

    <!-- 隐藏的原生取色器 -->
    <input
      ref="colorInputRef"
      type="color"
      :value="parsed.hex"
      class="color-picker__native-input"
      @input="onColorChange"
      @mousedown.stop
    >

    <!-- 透明度滑块（内联） -->
    <template v-if="enableAlpha">
      <mat-slider
        :model-value="parsed.alpha"
        :min="0"
        :max="100"
        :step="1"
        size="small"
        color="primary"
        class="color-picker__alpha-slider"
        @update:model-value="onAlphaSliderUpdate"
        @wheel.stop="onAlphaWheel"
      >
        <template #append>
          <span class="color-picker__alpha-value">{{ parsed.alpha }}%</span>
        </template>
      </mat-slider>
    </template>
  </div>
</template>

<style scoped>
.color-picker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.color-picker__preview {
  position: relative;
  width: 24px;
  height: 24px;
  border: 1px solid var(--mat-sys-color-outline-variant, rgb(0 0 0 / 25%));
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
  overflow: hidden;
  background: transparent;
  flex-shrink: 0;
  transition: border-color .2s;
}

.color-picker__preview:hover {
  border-color: var(--mat-sys-color-outline, rgb(0 0 0 / 50%));
}

/* 棋盘格背景：用于可视化半透明颜色 */
.color-picker__checker {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%);
  background-size: 8px 8px;
  background-position: 0 0, 0 4px, 4px -4px, -4px 0;
}

.color-picker__swatch {
  position: absolute;
  inset: 0;
}

/* 隐藏原生取色器 */
.color-picker__native-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.color-picker__alpha-slider {
  width: 130px;
}

.color-picker__alpha-value {
  font-size: 11px;
  color: var(--mat-sys-color-on-surface-variant, rgb(0 0 0 / 70%));
  min-width: 32px;
  text-align: right;
  font-family: monospace;
  font-weight: 500;
  user-select: none;
}
</style>
