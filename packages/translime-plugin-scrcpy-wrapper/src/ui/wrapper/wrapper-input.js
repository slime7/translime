/**
 * 输入复刻：把 wrapper 页面的鼠标/滚轮/键盘事件转成 scrcpy 控制消息。
 *
 * - 鼠标按 scrcpy 约定以 pointerId -1 注入；触摸分配小整数 finger id，
 *   多指的 POINTER_DOWN/UP 合成与 index 由设备端依据 pointerId 完成，这里始终发基础 action
 * - 坐标从 canvas 客户区换算到视频像素空间（server 依据消息内声明的视频尺寸再映射到设备）
 * - 键盘优先按 `event.code` 注入 keycode；无映射的可打印字符回落 INJECT_TEXT
 * - Ctrl+V 走 PC 剪贴板 → 设备剪贴板 + 粘贴（主进程实现）；Ctrl+C/X 原样注入设备
 */

import { keycodeForCode, metaStateForEvent } from './keycode-map';

// scrcpy 约定：鼠标 pointerId 为 -1（线上为 u64 最大值）
const POINTER_ID_MOUSE = -1;

// Android MotionEvent 基础 action（server 端负责多指时合成 POINTER_DOWN/UP）
const ACTION_DOWN = 0;
const ACTION_UP = 1;
const ACTION_MOVE = 2;
// 保留 DevTools 快捷键，避免窗口内无法调试
const isDevtoolsShortcut = (event) => event.key === 'F12'
  || (event.ctrlKey && event.shiftKey && ['I', 'J', 'C'].includes(event.key));

/**
 * 事件坐标换算到视频像素坐标（canvas CSS 尺寸 → 视频分辨率，含越界钳制）
 *
 * @param {PointerEvent|WheelEvent} event
 * @param {HTMLCanvasElement} canvas
 * @param {{ width: number, height: number }} videoSize
 * @returns {{ x: number, y: number }}
 */
export const toVideoPoint = (event, canvas, videoSize) => {
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width > 0 && rect.height > 0
    ? { x: videoSize.width / rect.width, y: videoSize.height / rect.height }
    : { x: 0, y: 0 };
  return {
    x: Math.min(videoSize.width - 1, Math.max(0, Math.round((event.clientX - rect.left) * scale.x))),
    y: Math.min(videoSize.height - 1, Math.max(0, Math.round((event.clientY - rect.top) * scale.y))),
  };
};

const sign = (value) => {
  if (value > 0) {
    return 1;
  }
  if (value < 0) {
    return -1;
  }
  return 0;
};

/** 鼠标注入固定压力，触摸取事件压力（部分浏览器按下瞬间为 0，兜底 0.5） */
const touchPressure = (event, action) => {
  if (event.pointerType === 'mouse') {
    return action === ACTION_UP ? 0 : 1;
  }
  return event.pressure > 0 ? event.pressure : 0.5;
};

/**
 * 挂载输入监听
 *
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas - 视频画布（指针/滚轮目标）。
 * @param {HTMLElement} options.keyboardTarget - 键盘事件目标（window）。
 * @param {() => { width: number, height: number }} options.getVideoSize - 当前视频尺寸。
 * @param {(message: object) => void} options.send - 发送控制消息。
 * @returns {() => void} 解绑函数。
 */
export const attachWrapperInput = ({
  canvas, keyboardTarget, getVideoSize, send,
}) => {
  // PointerEvent.pointerId → 注入用 finger id（多点时为小整数）
  const fingerIds = new Map();
  let nextFingerId = 0;

  const touchMessage = (event, action) => {
    const videoSize = getVideoSize();
    if (videoSize.width <= 0 || videoSize.height <= 0) {
      return;
    }
    const isMouse = event.pointerType === 'mouse';
    const pointerId = isMouse ? POINTER_ID_MOUSE : fingerIds.get(event.pointerId);
    if (pointerId === undefined) {
      return;
    }
    const { x, y } = toVideoPoint(event, canvas, videoSize);
    send({
      type: 'touch',
      action,
      pointerId,
      x,
      y,
      videoWidth: videoSize.width,
      videoHeight: videoSize.height,
      pressure: touchPressure(event, action),
    });
  };

  const onPointerDown = (event) => {
    if (event.pointerType !== 'mouse') {
      fingerIds.set(event.pointerId, nextFingerId);
      nextFingerId = (nextFingerId + 1) % 10;
    }
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    touchMessage(event, ACTION_DOWN);
  };

  const onPointerMove = (event) => {
    const isMouse = event.pointerType === 'mouse';
    if (!isMouse && !fingerIds.has(event.pointerId)) {
      return;
    }
    event.preventDefault();
    touchMessage(event, ACTION_MOVE);
  };

  const onPointerUp = (event) => {
    const isMouse = event.pointerType === 'mouse';
    if (!isMouse && !fingerIds.has(event.pointerId)) {
      return;
    }
    touchMessage(event, ACTION_UP);
    if (!isMouse) {
      fingerIds.delete(event.pointerId);
    }
    canvas.releasePointerCapture?.(event.pointerId);
  };

  const onWheel = (event) => {
    const videoSize = getVideoSize();
    if (videoSize.width <= 0 || videoSize.height <= 0) {
      return;
    }
    event.preventDefault();
    const { x, y } = toVideoPoint(event, canvas, videoSize);
    // 浏览器 deltaY 向下为正；Android vscroll 向上为正（与 scrcpy 滚轮方向一致）
    send({
      type: 'scroll',
      x,
      y,
      videoWidth: videoSize.width,
      videoHeight: videoSize.height,
      hscroll: sign(event.deltaX),
      vscroll: -sign(event.deltaY),
    });
  };

  const onKeyDown = (event) => {
    if (isDevtoolsShortcut(event)) {
      return;
    }
    // Ctrl+V：PC 剪贴板 → 设备剪贴板并粘贴（主进程实现），其余按键原样注入
    if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && event.code === 'KeyV' && !event.repeat) {
      event.preventDefault();
      send({ type: 'paste-clipboard' });
      return;
    }
    const keycode = keycodeForCode(event.code);
    if (keycode !== null) {
      event.preventDefault();
      send({
        type: 'keycode', action: 0, keycode, metaState: metaStateForEvent(event),
      });
      return;
    }
    // 无 keycode 映射的可打印字符走文本注入（支持 IME 组合后的中文串）
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      send({ type: 'text', text: event.key });
    }
  };

  const onKeyUp = (event) => {
    if (isDevtoolsShortcut(event)) {
      return;
    }
    const keycode = keycodeForCode(event.code);
    if (keycode !== null) {
      event.preventDefault();
      send({
        type: 'keycode', action: 1, keycode, metaState: metaStateForEvent(event),
      });
    }
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  keyboardTarget.addEventListener('keydown', onKeyDown);
  keyboardTarget.addEventListener('keyup', onKeyUp);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
    keyboardTarget.removeEventListener('keydown', onKeyDown);
    keyboardTarget.removeEventListener('keyup', onKeyUp);
  };
};
