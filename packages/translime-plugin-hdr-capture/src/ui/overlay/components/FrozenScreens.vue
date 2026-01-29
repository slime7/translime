<script setup>
defineProps({
  screens: Array,
  offsetX: Number,
  offsetY: Number,
});
</script>

<template>
  <div class="frozen-screens-layer">
    <div
      v-for="screen in screens"
      :key="screen.displayId"
      class="frozen-screen"
      :style="{
        left: (screen.bounds.x - offsetX) + 'px',
        top: (screen.bounds.y - offsetY) + 'px',
        width: screen.bounds.width + 'px',
        height: screen.bounds.height + 'px'
      }"
    >
      <img :src="screen.url" draggable="false">
    </div>
  </div>
</template>

<style scoped>
.frozen-screens-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

.frozen-screen {
  position: absolute;
}

.frozen-screen img {
  width: 100%;
  height: 100%;
  object-fit: fill;
  display: block;
}
</style>
