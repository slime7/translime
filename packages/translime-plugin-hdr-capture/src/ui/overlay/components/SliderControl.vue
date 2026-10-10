<script setup>
import { computed } from 'vue';

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

/** 安全钳制数值到 [min, max] 范围 */
const clamp = (val) => Math.max(props.min, Math.min(props.max, val));

const internalValue = computed({
  get: () => props.modelValue,
  set: (val) => {
    if (props.disabled) {
      return;
    }
    const num = Number(val);
    const clamped = clamp(Number.isNaN(num) ? props.min : Math.round(num / props.step) * props.step);
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
    class="slider-control"
    :class="{ 'slider-control--disabled': disabled }"
    @wheel.stop="onWheel"
  >
    <mat-slider
      v-model="internalValue"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      size="small"
      color="primary"
      class="slider-control__slider"
    >
      <template #append>
        <div class="slider-control__append">
          <input
            v-model.number="internalValue"
            type="number"
            :min="min"
            :max="max"
            :step="step"
            :disabled="disabled"
            class="slider-control__input"
            :style="{ width: inputWidth }"
            @mousedown.stop
          >
          <span
            v-if="unit"
            class="slider-control__unit"
          >{{ unit }}</span>
        </div>
      </template>
    </mat-slider>
  </div>
</template>

<style scoped>
.slider-control {
  display: flex;
  align-items: center;
  flex: 1;
  width: 100%;
  min-width: 140px;
}

.slider-control--disabled {
  opacity: .38;
  pointer-events: none;
}

.slider-control__slider {
  flex: 1;
  min-width: 130px;
}

.slider-control__append {
  display: flex;
  align-items: center;
  gap: 4px;
}

.slider-control__input {
  background: var(--mat-sys-color-surface-container-highest, rgb(0 0 0 / 20%));
  border: 1px solid var(--mat-sys-color-outline-variant, rgb(0 0 0 / 20%));
  border-radius: 4px;
  color: var(--mat-sys-color-on-surface, #1c1b1f);
  padding: 2px 4px;
  text-align: center;
  outline: none;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  min-width: 3ch;
  height: 24px;
  box-sizing: border-box;
  transition: border-color .2s, background-color .2s;
}

.slider-control__input:focus {
  border-color: var(--mat-sys-color-primary, #38bdf8);
  background: var(--mat-sys-color-surface, #fff);
  box-shadow: 0 0 0 1px var(--mat-sys-color-primary, #38bdf8);
}

/* 移除数字输入框的箭头 */
.slider-control__input::-webkit-outer-spin-button,
.slider-control__input::-webkit-inner-spin-button {
  appearance: none;
  margin: 0;
}

.slider-control__unit {
  color: var(--mat-sys-color-on-surface-variant, rgb(0 0 0 / 60%));
  font-size: 12px;
  font-weight: 500;
  margin-left: 2px;
  user-select: none;
}
</style>
