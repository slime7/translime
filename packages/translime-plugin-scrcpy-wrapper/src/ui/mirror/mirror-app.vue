<template>
  <mat-app-root class="mirror-root">
    <div class="relative h-dvh w-dvw overflow-hidden bg-transparent select-none">
      <!-- 窗口背景卡片 -->
      <div
        class="pointer-events-none absolute inset-0 transition-opacity duration-200 ease-out window-card-bg"
        :class="chromeVisible ? 'opacity-100' : 'opacity-0'"
      />

      <!-- 标题栏 -->
      <div
        class="absolute top-3 inset-x-4 z-30 flex h-8 items-center justify-between px-2 transition-opacity duration-200 ease-out window-drag-region"
        :class="chromeVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
        style="-webkit-app-region: drag; app-region: drag;"
      >
        <div class="flex min-w-0 items-center pr-2">
          <span class="truncate text-xs font-medium text-mat-on-surface-variant">{{ title }}</span>
        </div>
        <div
          class="flex items-center gap-1 window-no-drag"
          style="-webkit-app-region: no-drag; app-region: no-drag;"
        >
          <mat-btn
            variant="standard"
            size="extra-small"
            icon="remove"
            label="最小化"
            class="window-no-drag"
            style="-webkit-app-region: no-drag; app-region: no-drag;"
            @click="minimizeWindow"
          />
          <mat-btn
            variant="standard"
            size="extra-small"
            icon="close"
            label="关闭"
            class="window-no-drag"
            style="-webkit-app-region: no-drag; app-region: no-drag;"
            @click="closeWindow"
          />
        </div>
      </div>

      <!-- 画面接入前占位提示 -->
      <div
        v-if="!sdlRect && !freezeImage"
        class="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <span class="text-sm text-mat-on-surface-variant">等待画面接入…</span>
      </div>

      <!-- 画面外轮廓边框 -->
      <div
        v-if="sdlRect"
        class="pointer-events-none absolute transition-all duration-100 ease-out"
        :style="{
          left: `${sdlRect.x - 8}px`,
          top: `${sdlRect.y - 8}px`,
          width: `${sdlRect.width + 16}px`,
          height: `${sdlRect.height + 16}px`,
          borderWidth: '8px',
          borderStyle: 'solid',
          borderColor: 'var(--mat-sys-color-outline)',
          borderRadius: 'var(--mat-sys-shape-corner-extra-large, 28px)',
          boxShadow: 'var(--mat-sys-elevation-level1)',
        }"
      />

      <!-- 缩放过渡冻结帧 -->
      <div
        v-if="freezeImage && sdlRect"
        class="pointer-events-none absolute overflow-hidden transition-opacity duration-150 ease-out"
        :class="freezeVisible ? 'opacity-100' : 'opacity-0'"
        :style="{
          left: `${sdlRect.x}px`,
          top: `${sdlRect.y}px`,
          width: `${sdlRect.width}px`,
          height: `${sdlRect.height}px`,
          borderRadius: 'var(--mat-sys-shape-corner-large-increased, 20px)',
        }"
      >
        <img
          :src="freezeImage"
          alt=""
          class="h-full w-full scale-110 object-fill blur-2xl"
        >
      </div>

      <!-- 右侧可拖动区域 -->
      <div
        class="absolute bottom-0 right-0 z-20 transition-opacity duration-200 ease-out window-drag-region"
        :class="chromeVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
        :style="{
          top: '48px',
          left: sdlRect ? `${sdlRect.x + sdlRect.width + 8}px` : 'auto',
          width: sdlRect ? 'auto' : '136px',
        }"
        style="-webkit-app-region: drag; app-region: drag;"
      />

      <!-- 右侧工具栏 -->
      <mat-toolbar
        v-model="chromeVisible"
        variant="floating-right"
        position="start"
        class="z-30 window-no-drag"
        style="top: 60px; right: 16px; -webkit-app-region: no-drag; app-region: no-drag;"
      >
        <mat-btn
          variant="standard"
          size="medium"
          icon="arrow_back"
          label="返回"
          :disabled="sending"
          @click="sendKey(KEYCODE_BACK)"
        />
        <mat-btn
          variant="standard"
          size="medium"
          icon="home"
          label="主页"
          :disabled="sending"
          @click="sendKey(KEYCODE_HOME)"
        />
        <mat-btn
          variant="standard"
          size="medium"
          icon="crop_square"
          label="最近应用"
          :disabled="sending"
          @click="sendKey(KEYCODE_APP_SWITCH)"
        />
        <mat-btn
          variant="standard"
          size="medium"
          icon="open_in_new"
          :label="hasForegroundApp ? '新窗口打开' : '新窗口打开（前台无应用）'"
          :disabled="sending || !hasForegroundApp"
          @click="openInNewWindow"
        />
        <mat-btn
          variant="standard"
          size="medium"
          icon="power_settings_new"
          label="亮屏/息屏"
          :disabled="sending"
          @click="toggleScreen"
        />
      </mat-toolbar>
    </div>
  </mat-app-root>
</template>

<script setup>
import { onMounted, ref } from 'vue';

defineOptions({
  name: 'ScrcpyMirrorApp',
});

const KEYCODE_BACK = 4;
const KEYCODE_HOME = 3;
const KEYCODE_APP_SWITCH = 187;

const query = new URLSearchParams(window.location.search);
const sessionId = query.get('session') ?? '';
const title = query.get('title') ?? '画面';

const sending = ref(false);
const chromeVisible = ref(true);
const hasForegroundApp = ref(false);
const sdlRect = ref(null);
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

const openInNewWindow = async () => {
  if (sending.value) {
    return;
  }
  sending.value = true;
  try {
    await window.scrcpyWrapper?.openInNewWindow(sessionId);
  } finally {
    sending.value = false;
  }
};

const toggleScreen = async () => {
  if (sending.value) {
    return;
  }
  sending.value = true;
  try {
    await window.scrcpyWrapper?.toggleScreen(sessionId);
  } finally {
    sending.value = false;
  }
};

const minimizeWindow = () => {
  window.scrcpyWrapper?.windowControl?.minimize();
};

const closeWindow = () => {
  window.scrcpyWrapper?.windowControl?.close();
};

onMounted(() => {
  window.scrcpyWrapper?.onSdlRect?.((rect) => {
    sdlRect.value = rect;
  });
  window.scrcpyWrapper?.onChromeVisible?.((visible) => {
    chromeVisible.value = visible;
  });
  window.scrcpyWrapper?.onForegroundApp?.((info) => {
    hasForegroundApp.value = Boolean(info?.hasApp);
  });
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
.mirror-root {
  background: transparent !important;
}
</style>
