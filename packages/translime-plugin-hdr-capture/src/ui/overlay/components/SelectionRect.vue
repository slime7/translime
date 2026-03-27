<script setup>
import { computed, getCurrentInstance } from 'vue';

const emit = defineEmits(['resize-start']);

const props = defineProps({
  state: {
    type: Object,
    default: () => ({
      isSelecting: false, hasSelection: false, highlightedWindow: null, offsetX: 0, offsetY: 0,
    }),
  },
  bounds: {
    type: Object,
    default: () => ({
      x: 0, y: 0, w: 0, h: 0,
    }),
  },
});

const instance = getCurrentInstance();
const handleRadius = 6;
const handleHitRadius = 10;
const strokeWidth = 1.5;
const handleDefinitions = [
  { direction: 'nw', cx: 0, cy: 0, cursor: 'nw-resize' },
  { direction: 'n', cx: 0.5, cy: 0, cursor: 'n-resize', relativeX: true },
  { direction: 'ne', cx: 1, cy: 0, cursor: 'ne-resize', relativeX: true },
  { direction: 'e', cx: 1, cy: 0.5, cursor: 'e-resize', relativeX: true, relativeY: true },
  { direction: 'se', cx: 1, cy: 1, cursor: 'se-resize', relativeX: true, relativeY: true },
  { direction: 's', cx: 0.5, cy: 1, cursor: 's-resize', relativeX: true, relativeY: true },
  { direction: 'sw', cx: 0, cy: 1, cursor: 'sw-resize', relativeY: true },
  { direction: 'w', cx: 0, cy: 0.5, cursor: 'w-resize', relativeY: true },
];

const windowHighlightStyle = computed(() => {
  if (!props.state.highlightedWindow || props.state.isSelecting || props.state.hasSelection) return { display: 'none' };

  const win = props.state.highlightedWindow;
  return {
    left: `${win.left - props.state.offsetX}px`,
    top: `${win.top - props.state.offsetY}px`,
    width: `${win.width}px`,
    height: `${win.height}px`,
  };
});

const highlightMeta = computed(() => {
  if (!props.state.highlightedWindow || props.state.isSelecting || props.state.hasSelection) {
    return null;
  }

  const width = Math.max(0, Math.round(props.state.highlightedWindow.width || 0));
  const height = Math.max(0, Math.round(props.state.highlightedWindow.height || 0));
  const sizeLabel = `${width} x ${height}`;

  if (props.state.captureMode === 'element') {
    return {
      tone: 'border-[#f59e0b]',
      label: sizeLabel,
    };
  }

  return {
    tone: 'border-[#38bdf8]',
    label: sizeLabel,
  };
});

const selectionContainerStyle = computed(() => ({
  left: `${props.bounds.x}px`,
  top: `${props.bounds.y}px`,
  width: `${props.bounds.w}px`,
  height: `${props.bounds.h}px`,
}));

const selectionRadius = computed(() => Math.max(0, props.state.borderRadius || 0));
const svgWidth = computed(() => Math.max(props.bounds.w, 1));
const svgHeight = computed(() => Math.max(props.bounds.h, 1));
const svgCanvasWidth = computed(() => svgWidth.value + (handleRadius * 2));
const svgCanvasHeight = computed(() => svgHeight.value + (handleRadius * 2));
const svgViewBox = computed(() => `${-handleRadius} ${-handleRadius} ${svgCanvasWidth.value} ${svgCanvasHeight.value}`);
const svgMaskId = `selection-handles-mask-${instance?.uid ?? '0'}`;
const showResizeHandles = computed(() => !props.state.isMoving && props.state.hasSelection && !props.state.drawingMode);

const selectionHandleDots = computed(() => handleDefinitions.map((handle) => ({
  ...handle,
  x: handle.relativeX ? svgWidth.value * handle.cx : 0,
  y: handle.relativeY ? svgHeight.value * handle.cy : 0,
})));

const onHandleMouseDown = (direction) => {
  emit('resize-start', direction);
};
</script>

<template>
  <div class="absolute inset-0 z-10 pointer-events-none">
    <div
      class="absolute border-2 border-dashed transition-all duration-150 ease-out box-border rounded-sm"
      :class="highlightMeta?.tone"
      :style="windowHighlightStyle"
    >
      <div
        v-if="highlightMeta?.label"
        class="absolute -top-7 left-0 max-w-[320px] truncate bg-black/75 backdrop-blur-md text-white px-2 py-1 rounded-md text-xs whitespace-nowrap shadow-lg pointer-events-none border border-white/10"
      >
        {{ highlightMeta.label }}
      </div>
    </div>

    <div
      v-if="state.isSelecting || state.hasSelection"
      class="absolute"
      :style="selectionContainerStyle"
    >
      <svg
        class="absolute pointer-events-none overflow-visible"
        :style="{
          left: `${-handleRadius}px`,
          top: `${-handleRadius}px`,
          width: `${svgCanvasWidth}px`,
          height: `${svgCanvasHeight}px`,
        }"
        :viewBox="svgViewBox"
      >
        <defs>
          <mask :id="svgMaskId" maskUnits="userSpaceOnUse">
            <rect
              :x="-handleRadius"
              :y="-handleRadius"
              :width="svgCanvasWidth"
              :height="svgCanvasHeight"
              fill="white"
            />
            <rect
              x="0"
              y="0"
              :width="svgWidth"
              :height="svgHeight"
              :rx="selectionRadius"
              :ry="selectionRadius"
              fill="black"
            />
          </mask>
        </defs>

        <g
          v-if="showResizeHandles"
          :mask="`url(#${svgMaskId})`"
        >
          <circle
            v-for="handle in selectionHandleDots"
            :key="handle.direction"
            :cx="handle.x"
            :cy="handle.y"
            :r="handleRadius"
            fill="white"
            stroke="#38bdf8"
            :stroke-width="1.25"
          />
        </g>

        <rect
          x="0"
          y="0"
          :width="svgWidth"
          :height="svgHeight"
          :rx="selectionRadius"
          :ry="selectionRadius"
          fill="none"
          stroke="#38bdf8"
          :stroke-width="strokeWidth"
          vector-effect="non-scaling-stroke"
          class="drop-shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
        />
      </svg>

      <button
        v-for="handle in showResizeHandles ? selectionHandleDots : []"
        :key="`hit-${handle.direction}`"
        type="button"
        class="absolute z-20 block rounded-full border-0 bg-transparent p-0 pointer-events-auto"
        :style="{
          left: `${handle.x - handleHitRadius}px`,
          top: `${handle.y - handleHitRadius}px`,
          width: `${handleHitRadius * 2}px`,
          height: `${handleHitRadius * 2}px`,
          cursor: handle.cursor,
        }"
        @mousedown.stop="onHandleMouseDown(handle.direction)"
      />

      <div
        class="absolute inset-0 z-10 box-border pointer-events-auto"
        :class="state.drawingMode ? 'cursor-crosshair' : 'cursor-move'"
        :style="{
          borderRadius: `${selectionRadius}px`,
        }"
      >
        <div
          v-if="bounds.w > 80 && bounds.h > 24"
          class="absolute -top-7 left-0 bg-black/75 backdrop-blur-md text-white px-2 py-1 rounded-md text-xs whitespace-nowrap shadow-lg pointer-events-none border border-white/10 font-mono tracking-wide"
        >
          {{ Math.round(bounds.w) }} x {{ Math.round(bounds.h) }}
        </div>
      </div>
    </div>
  </div>
</template>
