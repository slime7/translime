<template>
  <mat-app-root class="wrapper-root">
    <!-- 高度用 100dvh：app-root 内容层高度为 auto，百分比高度链在此不通 -->
    <div class="flex h-dvh flex-col">
      <!-- 画面接入前占位；接入后该区域被原生 SDL 子窗口覆盖 -->
      <div class="flex min-h-0 grow items-center justify-center">
        <span class="text-sm text-white/50">等待画面接入…</span>
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
import { ref } from 'vue';

defineOptions({
  name: 'ScrcpyWrapperApp',
});

const KEYCODE_BACK = 4;
const KEYCODE_HOME = 3;

const sessionId = new URLSearchParams(window.location.search).get('session') ?? '';
const sending = ref(false);

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
