<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  /** 当前值 (v-model) */
  modelValue: {
    type: Number,
    default: 0,
  },
  /** 最小值 */
  min: {
    type: Number,
    default: 0,
  },
  /** 最大值 */
  max: {
    type: Number,
    default: 100,
  },
  /** 步进值 */
  step: {
    type: Number,
    default: 1,
  },
  /** 是否禁用 */
  disabled: {
    type: Boolean,
    default: false,
  },
  /** 单位文本 */
  unit: {
    type: String,
    default: 'px',
  },
  /** 数值输入框宽度 */
  inputWidth: {
    type: String,
    default: '50px',
  },
});

const emit = defineEmits(['update:modelValue']);

const sliderRef = ref(null);

/** 安全钳制数值到 [min, max] 范围 */
const clamp = (val) => Math.max(props.min, Math.min(props.max, val));

const internalValue = computed({
  get: () => props.modelValue,
  set: (val) => {
    if (props.disabled) {
      return;
    }
    const clamped = clamp(parseInt(val, 10) || 0);
    emit('update:modelValue', clamped);
  },
});

/**
 * 滚轮事件处理：在滑块区域滚动滚轮可改变数值
 * @param {WheelEvent} e - 滚轮事件
 */
const onWheel = (e) => {
  if (props.disabled) {
    return;
  }
  e.preventDefault();
  e.stopPropagation();

  const direction = e.deltaY > 0 ? -1 : 1;
  const newVal = clamp(props.modelValue + direction * props.step);
  emit('update:modelValue', newVal);
};
</script>

<template>
  <div
    ref="sliderRef"
    class="slider-control"
    :class="{ 'slider-control--disabled': disabled }"
    @wheel.stop="onWheel"
  >
    <input
      v-model="internalValue"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      class="slider-control__range"
      @mousedown.stop
    >

    <input
      v-model="internalValue"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      class="slider-control__input"
      :style="{ width: inputWidth }"
      @mousedown.stop
    >

    <span v-if="unit" class="slider-control__unit">{{ unit }}</span>
  </div>
</template>

<style scoped>
.slider-control {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #eee;
  font-size: 13px;
}

.slider-control--disabled {
  opacity: .4;
  pointer-events: none;
}

.slider-control__range {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgb(255 255 255 / 30%);
  outline: none;
  accent-color: #38bdf8;
  width: 100px;
}

.slider-control__input {
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

.slider-control__input:focus {
  border-color: #38bdf8;
  background: rgb(0 0 0 / 50%);
}

/* 移除数字输入框的箭头 */
.slider-control__input::-webkit-outer-spin-button,
.slider-control__input::-webkit-inner-spin-button {
  appearance: none;
  margin: 0;
}

.slider-control__unit {
  color: rgb(255 255 255 / 50%);
  font-size: 12px;
  margin-left: 2px;
}
</style>
