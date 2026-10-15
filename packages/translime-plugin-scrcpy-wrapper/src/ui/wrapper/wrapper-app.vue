<template>
  <mat-app-root class="wrapper-root">
    <!-- 高度用 100dvh：app-root 内容层高度为 auto，百分比高度链在此不通 -->
    <div class="flex h-dvh flex-col">
      <div
        ref="stageRef"
        class="relative flex min-h-0 grow items-center justify-center bg-black"
        @pointerdown="resumeAudio"
      >
        <canvas
          v-show="status === 'streaming'"
          ref="canvasRef"
          class="video-canvas"
        />
        <div
          v-if="status !== 'streaming'"
          class="flex flex-col items-center gap-2 px-6 text-center"
        >
          <span class="text-sm text-white/60">{{ status === 'error' ? errorMessage : '正在连接设备…' }}</span>
          <mat-btn
            v-if="status === 'error'"
            variant="text"
            label="关闭窗口"
            @click="closeWindow"
          />
        </div>
        <div
          v-if="audioNotice"
          class="absolute bottom-2 rounded bg-black/70 px-3 py-1 text-xs text-white/80"
        >
          {{ audioNotice }}
        </div>
      </div>

      <!-- 高度 48px（h-12）与主进程 BAR_CSS_HEIGHT 一致：画面区 = 窗口内容区 - 该底条 -->
      <div class="flex h-12 shrink-0 items-center justify-center gap-3 bg-mat-surface-container">
        <mat-btn
          variant="text"
          label="返回"
          :disabled="status !== 'streaming'"
          @click="pressBack"
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
          :disabled="status !== 'streaming'"
          @click="pressHome"
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
import { onMounted, onUnmounted, ref } from 'vue';
import ScrcpyVideoRenderer from './wrapper-decoder';
import ScrcpyAudioPlayer from './wrapper-audio';
import { attachWrapperInput } from './wrapper-input';

defineOptions({
  name: 'ScrcpyWrapperApp',
});

const KEYCODE_HOME = 3;
// 虚拟屏跟随窗口的防抖间隔
const RESIZE_DEBOUNCE_MS = 120;

const query = new URLSearchParams(window.location.search);
const sessionId = query.get('session') ?? '';
const mode = query.get('mode') ?? 'mirror';

const canvasRef = ref(null);
const stageRef = ref(null);
const status = ref('connecting');
const errorMessage = ref('');
const audioNotice = ref('');

let videoSize = { width: 0, height: 0 };
let videoRenderer = null;
let audioPlayer = null;
let detachMedia = null;
let detachInput = null;
let resizeObserver = null;
let resizeTimer = 0;

const send = (message) => {
  window.scrcpyWrapper?.sendInput(sessionId, message);
};

const handleMedia = (payload) => {
  if (payload.sessionId !== sessionId) {
    return;
  }
  switch (payload.kind) {
  case 'session':
    if (payload.media === 'video') {
      videoSize = { width: payload.width, height: payload.height };
      videoRenderer?.handleSession(payload);
      status.value = 'streaming';
    }
    break;
  case 'video':
    videoRenderer?.handleFrame(payload);
    break;
  case 'audio':
    audioPlayer?.handleFrame(payload);
    break;
  case 'error':
    if (payload.scope === 'video') {
      status.value = 'error';
      errorMessage.value = payload.message || '画面连接已断开';
    } else {
      audioNotice.value = payload.message || '音频不可用';
    }
    break;
  default:
    break;
  }
};

// 虚拟屏 + flex_display：画面区尺寸变化时请求设备端同步调整虚拟屏分辨率
const requestResizeDisplay = () => {
  if (mode !== 'virtual' || status.value !== 'streaming' || !stageRef.value) {
    return;
  }
  const scale = window.devicePixelRatio || 1;
  const width = Math.round(stageRef.value.clientWidth * scale);
  const height = Math.round(stageRef.value.clientHeight * scale);
  if (width > 0 && height > 0) {
    send({ type: 'resize-display', width, height });
  }
};

const onStageResize = () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(requestResizeDisplay, RESIZE_DEBOUNCE_MS);
};

const pressBack = () => {
  send({ type: 'back', action: 0 });
  send({ type: 'back', action: 1 });
};

const pressHome = () => {
  send({ type: 'keycode', action: 0, keycode: KEYCODE_HOME });
  send({ type: 'keycode', action: 1, keycode: KEYCODE_HOME });
};

const resumeAudio = () => {
  audioPlayer?.resume();
};

const closeWindow = () => {
  window.close();
};

onMounted(() => {
  videoRenderer = new ScrcpyVideoRenderer({
    canvas: canvasRef.value,
    onError: (message) => {
      status.value = 'error';
      errorMessage.value = message;
    },
  });
  audioPlayer = new ScrcpyAudioPlayer({
    onError: (message) => {
      audioNotice.value = message;
    },
  });
  detachMedia = window.scrcpyWrapper?.onMedia(handleMedia) ?? null;
  detachInput = attachWrapperInput({
    canvas: canvasRef.value,
    keyboardTarget: window,
    getVideoSize: () => videoSize,
    send,
  });
  resizeObserver = new ResizeObserver(onStageResize);
  resizeObserver.observe(stageRef.value);
});

onUnmounted(() => {
  detachMedia?.();
  detachInput?.();
  resizeObserver?.disconnect();
  window.clearTimeout(resizeTimer);
  videoRenderer?.destroy();
  audioPlayer?.destroy();
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

/* canvas 为替换元素：位图尺寸即固有尺寸，max 约束下浏览器保持等比缩放（letterbox） */
.video-canvas {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
}
</style>
