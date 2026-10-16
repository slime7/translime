<template>
  <mat-app-root
    class="mirror-root"
    :fill-viewport="false"
  >
    <div class="relative flex h-dvh w-dvh flex-col overflow-hidden bg-transparent select-none">
      <!-- 窗口背景卡片 -->
      <div
        class="window-card-bg window-fade pointer-events-none absolute inset-0"
        :class="chromeVisible ? 'opacity-100' : 'opacity-0'"
      />

      <!-- 顶部标题区：自然流首行，整行可拖动，悬浮标题栏在其中淡入淡出 -->
      <div
        class="window-drag-region flex h-10 shrink-0 items-center px-4"
        style="-webkit-app-region: drag; app-region: drag;"
      >
        <div
          class="window-fade flex h-8 min-w-0 grow items-center justify-between"
          :class="chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'"
          style="-webkit-app-region: drag; app-region: drag;"
        >
          <div class="flex min-w-0 items-center pr-2">
            <span class="truncate text-xs font-medium text-[var(--mat-sys-color-on-surface-variant)]">{{ title }}</span>
          </div>
          <div
            class="window-no-drag flex items-center gap-1"
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
      </div>

      <!-- 中部：由 SDL 矩形反推的 spacer 与画面框在自然流中互相撑开 -->
      <div class="flex min-h-0 grow flex-col">
        <div
          class="shrink-0"
          :style="{ height: `${topSpacer}px` }"
        />
        <div class="flex min-h-0 grow">
          <!-- 左侧留白拖动 -->
          <div
            class="window-drag-region h-full shrink-0"
            :style="{ width: `${leftSpacer}px` }"
          />
          <!-- 画面框：边框即外轮廓，背景与边框同色填满圆角裁切缝隙 -->
          <div
            v-if="sdlRect"
            class="shrink-0"
            :style="{
              boxSizing: 'border-box',
              width: `${sdlRect.width + SDL_BORDER * 2}px`,
              height: `${sdlRect.height + SDL_BORDER * 2}px`,
              border: `${SDL_BORDER}px solid var(--mat-sys-color-outline)`,
              borderRadius: 'var(--mat-sys-shape-corner-extra-large, 28px)',
              background: 'var(--mat-sys-color-outline)',
              boxShadow: 'var(--mat-sys-elevation-level1)',
            }"
          >
            <!-- 画面占位容器：以 scrcpy SDL 实际尺寸撑开画面框 -->
            <div
              class="relative h-full w-full overflow-hidden"
              :style="{ borderRadius: 'var(--mat-sys-shape-corner-large-increased, 20px)' }"
            >
              <!-- 缩放过渡冻结帧 -->
              <div
                v-if="freezeImage"
                class="window-fade-fast pointer-events-none absolute inset-0 overflow-hidden"
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
          <!-- 画面接入前占位提示 -->
          <div
            v-else
            class="pointer-events-none flex grow items-center justify-center"
          >
            <span class="text-sm text-[var(--mat-sys-color-on-surface-variant)]">等待画面接入…</span>
          </div>
          <!-- 右侧工具栏区：可拖动，悬浮工具栏叠加其上 -->
          <div
            class="window-drag-region h-full grow"
          />
        </div>
        <!-- 底部留白拖动 -->
        <div class="window-drag-region h-4 shrink-0" />
      </div>

      <!-- 右侧工具栏 -->
      <mat-toolbar
        v-model="chromeVisible"
        variant="floating-right"
        position="start"
        class="window-no-drag z-30"
        style="top: 56px; right: 16px; -webkit-app-region: no-drag; app-region: no-drag;"
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
          label="最近任务"
          :disabled="sending"
          @click="sendKey(KEYCODE_APP_SWITCH)"
        />
        <mat-btn
          variant="standard"
          size="medium"
          icon="screen_rotation"
          label="切换横竖屏"
          :disabled="sending"
          @click="rotateDevice"
        />
        <mat-btn
          variant="standard"
          size="medium"
          icon="open_in_new"
          label="新窗口"
          :disabled="sending || !hasForegroundApp"
          @click="openInNewWindow"
        />
        <mat-btn
          variant="standard"
          size="medium"
          icon="power_settings_new"
          label="电源"
          :disabled="sending"
          @click="toggleScreen"
        />
      </mat-toolbar>
    </div>
  </mat-app-root>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';

defineOptions({
  name: 'ScrcpyMirrorApp',
});

// 与 src/scrcpy.js 的 TITLE_ROW_CSS_HEIGHT / SDL_BORDER_CSS / OUTER_GAP_CSS 保持一致
const TITLE_ROW_HEIGHT = 40;
const SDL_BORDER = 8;
const OUTER_GAP = 16;

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

// 顶部/左侧 spacer 由 SDL 矩形反推：容纳 fitVideoRect 居中与 DPI 取整偏差，
// 让画面框在自然流中始终精确包住 SDL 实际位置
const topSpacer = computed(() => (sdlRect.value
  ? Math.max(0, sdlRect.value.y - SDL_BORDER - TITLE_ROW_HEIGHT)
  : 0));
const leftSpacer = computed(() => (sdlRect.value
  ? Math.max(0, sdlRect.value.x - SDL_BORDER)
  : OUTER_GAP));

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

const rotateDevice = async () => {
  if (sending.value) {
    return;
  }
  sending.value = true;
  try {
    await window.scrcpyWrapper?.rotateDevice(sessionId);
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
  /* 浮动工具栏会向 mat-app-root 登记边缘内边距，透明悬浮窗口自行管理留白，直接清零 */
  --mat-app-root-padding-top: 0px;
  --mat-app-root-padding-bottom: 0px;
  --mat-app-root-padding-start: 0px;
  --mat-app-root-padding-end: 0px;
}
</style>
