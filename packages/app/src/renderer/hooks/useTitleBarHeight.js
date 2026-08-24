import {
  onMounted,
  onUnmounted,
  ref,
} from 'vue';

/**
 * 标题栏高度测量工具
 * 优先读取 Window Controls Overlay 实测高度并同步给 v-system-bar 的 height prop；
 * 实测值缺失或小于 20px 时回退到 32px。
 */

export const TITLE_BAR_HEIGHT_FALLBACK = 32;
export const TITLE_BAR_HEIGHT_MIN = 20;

const POLL_INTERVAL_MS = 100;
const POLL_MAX_COUNT = 30;

/**
 * 判断原生窗口控制覆盖（WCO）是否处于活跃状态
 * 当且仅当 WCO 存在、可见且预留了右侧控件宽度时判定为原生 WCO 活跃
 * @returns {boolean}
 */
export const isNativeOverlayActive = () => {
  const wco = navigator.windowControlsOverlay;
  if (!wco || wco.visible === false) {
    return false;
  }
  const rect = wco.getTitlebarAreaRect?.();
  if (!rect || !rect.width) {
    return false;
  }
  if (typeof window !== 'undefined' && window.innerWidth > 0 && rect.width >= window.innerWidth) {
    return false;
  }
  return true;
};

/**
 * 获取系统标题栏实测高度（CSS px）
 * @returns {number}
 */
export const getTitleBarHeight = () => {
  const wco = navigator.windowControlsOverlay;
  const height = wco?.getTitlebarAreaRect?.()?.height;
  return typeof height === 'number' && height >= TITLE_BAR_HEIGHT_MIN
    ? height
    : TITLE_BAR_HEIGHT_FALLBACK;
};

/**
 * 响应式标题栏高度
 * 启动时窗口可能尚未显示，WCO rect 会短暂为 0，因此轮询直到拿到有效实测值；
 * 之后通过 geometrychange / resize / visibilitychange 持续同步。
 * @returns {{ height: import('vue').Ref<number>, hasNativeOverlay: import('vue').Ref<boolean> }}
 */
export const useTitleBarHeight = () => {
  const height = ref(getTitleBarHeight());
  const hasNativeOverlay = ref(isNativeOverlayActive());

  let pollTimer = null;
  let pollCount = 0;
  let stop = null;

  const sync = () => {
    height.value = getTitleBarHeight();
    hasNativeOverlay.value = isNativeOverlayActive();
  };

  const hasMeasuredHeight = () => {
    const wco = navigator.windowControlsOverlay;
    const value = wco?.getTitlebarAreaRect?.()?.height;
    return typeof value === 'number' && value >= TITLE_BAR_HEIGHT_MIN;
  };

  onMounted(() => {
    sync();
    pollTimer = setInterval(() => {
      pollCount += 1;
      if (hasMeasuredHeight() || pollCount >= POLL_MAX_COUNT) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      sync();
    }, POLL_INTERVAL_MS);

    const wco = navigator.windowControlsOverlay;
    wco?.addEventListener('geometrychange', sync);
    window.addEventListener('resize', sync);
    document.addEventListener('visibilitychange', sync);

    stop = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      wco?.removeEventListener('geometrychange', sync);
      window.removeEventListener('resize', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  });

  onUnmounted(() => {
    stop?.();
  });

  return {
    height,
  };
};
