<template>
  <mat-app-root
    class="virtual-root"
    :fill-viewport="true"
    :scrollable="false"
  >
    <div class="relative h-dvh w-dvw overflow-hidden bg-black select-none flex flex-col">
      <!-- 标题栏 -->
      <div
        class="flex h-8 shrink-0 items-center justify-between px-3 bg-[var(--mat-sys-color-surface-container)]"
        style="-webkit-app-region: drag"
      >
        <span class="min-w-0 truncate text-xs font-medium text-[var(--mat-sys-color-on-surface-variant)]">{{ title }}</span>
      </div>

      <!-- 画面区 -->
      <div class="relative flex min-h-0 grow items-center justify-center overflow-hidden">
        <span
          v-if="!freezeImage"
          class="text-sm text-[var(--mat-sys-color-on-surface-variant)]"
        >等待画面接入…</span>
        <div
          v-else
          class="window-fade-fast pointer-events-none absolute inset-0"
          :class="freezeVisible ? 'opacity-100' : 'opacity-0'"
        >
          <img
            :src="freezeImage"
            alt=""
            class="h-full w-full scale-110 object-fill blur-2xl"
          >
        </div>
      </div>
    </div>
  </mat-app-root>
</template>

<script setup>
import { onMounted, ref } from 'vue';

defineOptions({
  name: 'ScrcpyVirtualApp',
});

const query = new URLSearchParams(window.location.search);
const title = query.get('title') ?? '画面';

const freezeImage = ref('');
const freezeVisible = ref(false);

onMounted(() => {
  window.scrcpyWrapper?.onFreezeFrame?.((frame) => {
    freezeImage.value = frame;
    freezeVisible.value = true;
  });
  window.scrcpyWrapper?.onFreezeEnd?.(() => {
    if (!freezeImage.value) {
      return;
    }
    freezeVisible.value = false;
    setTimeout(() => {
      freezeImage.value = '';
    }, 200);
  });
});
</script>

<style scoped>
.virtual-root {
  background: #000000 !important;
  overflow: hidden !important;
}
</style>
