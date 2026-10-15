<template>
  <mat-app-root class="wrapper-root">
    <!-- 高度用 100dvh：app-root 内容层高度为 auto，百分比高度链在此不通 -->
    <div class="flex h-dvh flex-col">
      <!-- 自绘标题栏：高度 32px（h-8）与主进程 TITLE_BAR_CSS_HEIGHT 及
           titleBarOverlay.height 一致，整条可拖动，右上角为系统控制按钮覆盖区 -->
      <div
        class="flex h-8 shrink-0 items-center bg-mat-surface-container"
        style="-webkit-app-region: drag"
      >
        <span class="min-w-0 truncate pl-3 text-xs text-white/70">{{ title }}</span>
        <!-- 标题栏按钮预留位：后续新增按钮时用 no-drag 区域包裹 -->
      </div>

      <!-- 画面区：接入前显示占位；SDL 子窗口覆盖在网页之上，
           因此冻结帧覆盖层显示期间会先隐藏子窗口 -->
      <div class="relative flex min-h-0 grow items-center justify-center overflow-hidden">
        <span
          v-if="!freezeImage"
          class="text-sm text-white/50"
        >等待画面接入…</span>
        <div
          v-else
          class="pointer-events-none absolute inset-0 transition-opacity duration-150 ease-out"
          :class="freezeVisible ? 'opacity-100' : 'opacity-0'"
        >
          <img
            :src="freezeImage"
            alt=""
            class="h-full w-full scale-110 object-fill blur-2xl"
          >
        </div>
      </div>

      <!-- 高度 48px（h-12）与主进程 BAR_CSS_HEIGHT 一致：SDL 子窗口按客户区减该高度定位 -->
      <div class="flex h-12 shrink-0 items-center justify-center gap-3 bg-mat-surface-container">
        <mat-btn
          variant="text"
          label="返回"
          :disabled="sending"
          @click="sendKey(KEYCODE_BACK)"
        >
          <template #prefix>
            <svg
              class="bar-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
          </template>
        </mat-btn>
        <mat-btn
          variant="text"
          label="主页"
          :disabled="sending"
          @click="sendKey(KEYCODE_HOME)"
        >
          <template #prefix>
            <svg
              class="bar-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
            </svg>
          </template>
        </mat-btn>
      </div>
    </div>
  </mat-app-root>
</template>

<script setup>
import { onMounted, ref } from 'vue';

defineOptions({
  name: 'ScrcpyWrapperApp',
});

const KEYCODE_BACK = 4;
const KEYCODE_HOME = 3;

const query = new URLSearchParams(window.location.search);
const sessionId = query.get('session') ?? '';
const title = query.get('title') ?? '画面';

const sending = ref(false);
// 冻结帧：拖动调整尺寸期间显示，撤帧先淡出再释放图片资源
const freezeImage = ref('');
const freezeVisible = ref(false);

const sendKey = async (keycode) => {
  if (sending.value) {
    return;
  }
  sending.value = true;
  try {
    await window.scrcpyWrapper?.sendKey(sessionId, keycode);
  } finally {
    sending.value = false;
  }
};

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

<!-- 独立窗口无宿主 Material Symbols 字体，底条图标使用内联 SVG，随主题色着色 -->
<style scoped>
.bar-icon {
  display: block;
  width: 24px;
  height: 24px;
  fill: currentColor;
}
</style>
