/**
 * scrcpy 控制消息编码（scrcpy v5.0.1 ControlMessageReader.java 布局，大端）。
 *
 * 每条消息首字节为类型，其后各字段宽度固定；编码结果直接写入控制 socket。
 */

import { Buffer } from 'node:buffer';

export const CONTROL_TYPE = {
  INJECT_KEYCODE: 0,
  INJECT_TEXT: 1,
  INJECT_TOUCH_EVENT: 2,
  INJECT_SCROLL_EVENT: 3,
  BACK_OR_SCREEN_ON: 4,
  EXPAND_NOTIFICATION_PANEL: 5,
  EXPAND_SETTINGS_PANEL: 6,
  COLLAPSE_PANELS: 7,
  GET_CLIPBOARD: 8,
  SET_CLIPBOARD: 9,
  SET_DISPLAY_POWER: 10,
  ROTATE_DEVICE: 11,
  OPEN_HARD_KEYBOARD_SETTINGS: 15,
  START_APP: 16,
  RESET_VIDEO: 17,
  RESIZE_DISPLAY: 21,
};

/** Android MotionEvent action */
export const ACTION_DOWN = 0;
export const ACTION_UP = 1;
export const ACTION_MOVE = 2;
export const ACTION_POINTER_DOWN = 5;
export const ACTION_POINTER_UP = 6;
/** 多点触控时 pointer index 在 action 中的位移（MotionEvent.ACTION_POINTER_INDEX_SHIFT） */
export const ACTION_POINTER_INDEX_SHIFT = 8;

/** scrcpy 约定：鼠标以 pointerId -1 注入（线上为 u64 最大值） */
export const POINTER_ID_MOUSE = -1n;

/** KeyEvent META_* 修饰键掩码 */
export const META_SHIFT_ON = 0x00000001;
export const META_ALT_ON = 0x00000002;
export const META_CTRL_ON = 0x00001000;
export const META_META_ON = 0x00010000;

/** Android KeyEvent keycode（本插件用到的子集） */
export const KEYCODE = {
  HOME: 3,
  BACK: 4,
  PASTE: 279,
};

const INJECT_TEXT_MAX_BYTES = 300;

/** Android 侧约定 pointerId 为 u64，负数 id（如鼠标 -1）转为两补码无符号值 */
const toU64PointerId = (pointerId) => BigInt.asUintN(64, BigInt(pointerId));

/**
 * [0,1] 浮点转 u16 定点（对照 scrcpy sc_float_to_u16fp）
 *
 * @param {number} value
 * @returns {number}
 */
const floatToU16Fp = (value) => {
  const scaled = Math.round(Math.min(1, Math.max(0, Number(value) || 0)) * 0x10000);
  return Math.min(0xffff, scaled);
};

/**
 * [-1,1] 浮点转 i16 定点（对照 scrcpy sc_float_to_i16fp）
 *
 * @param {number} value
 * @returns {number}
 */
const floatToI16Fp = (value) => {
  const scaled = Math.round(Math.min(1, Math.max(-1, Number(value) || 0)) * 0x8000);
  return scaled >= 0x8000 ? 0x7fff : scaled;
};

/**
 * 注入按键事件（INJECT_KEYCODE）
 *
 * @param {object} options
 * @param {number} options.action - ACTION_DOWN / ACTION_UP。
 * @param {number} options.keycode - Android keycode。
 * @param {number} [options.repeat=0]
 * @param {number} [options.metaState=0] - META_* 掩码。
 * @returns {Buffer}
 */
export const injectKeycode = ({
  action, keycode, repeat = 0, metaState = 0,
}) => {
  const buf = Buffer.alloc(14);
  buf.writeUInt8(CONTROL_TYPE.INJECT_KEYCODE, 0);
  buf.writeUInt8(action, 1);
  buf.writeInt32BE(keycode, 2);
  buf.writeInt32BE(repeat, 6);
  buf.writeInt32BE(metaState, 10);
  return buf;
};

/** UTF-8 首字节对应的字符总字节数 */
const utf8CharLength = (lead) => {
  if (lead < 0x80) {
    return 1;
  }
  if (lead < 0xE0) {
    return 2;
  }
  if (lead < 0xF0) {
    return 3;
  }
  return 4;
};

/**
 * 注入文本（INJECT_TEXT），UTF-8 超长按字节截断到 server 上限
 *
 * @param {string} text
 * @returns {Buffer}
 */
export const injectText = (text) => {
  const bytes = Buffer.from(String(text), 'utf8');
  let payload = bytes;
  if (bytes.length > INJECT_TEXT_MAX_BYTES) {
    // 按字符边界截断：完整放入的字节序列不超过 server 上限
    let end = 0;
    let i = 0;
    while (i < bytes.length && end < INJECT_TEXT_MAX_BYTES) {
      const charLength = utf8CharLength(bytes[i]);
      if (i + charLength > INJECT_TEXT_MAX_BYTES) {
        break;
      }
      i += charLength;
      end = i;
    }
    payload = bytes.subarray(0, end);
  }
  const buf = Buffer.alloc(5 + payload.length);
  buf.writeUInt8(CONTROL_TYPE.INJECT_TEXT, 0);
  buf.writeUInt32BE(payload.length, 1);
  payload.copy(buf, 5);
  return buf;
};

/**
 * 注入触摸/鼠标事件（INJECT_TOUCH_EVENT）
 *
 * @param {object} options
 * @param {number} options.action - MotionEvent 基础 action（DOWN/UP/MOVE），多指 index 由设备端合成。
 * @param {number|bigint} options.pointerId - 手指 id 或 POINTER_ID_MOUSE。
 * @param {number} options.x - 视频像素坐标。
 * @param {number} options.y - 视频像素坐标。
 * @param {number} options.videoWidth - 声明坐标系宽度（当前视频宽度）。
 * @param {number} options.videoHeight - 声明坐标系高度。
 * @param {number} options.pressure - [0,1]。
 * @param {number} [options.actionButton=0]
 * @param {number} [options.buttons=0]
 * @returns {Buffer}
 */
export const injectTouch = ({
  action,
  pointerId,
  x,
  y,
  videoWidth,
  videoHeight,
  pressure,
  actionButton = 0,
  buttons = 0,
}) => {
  const buf = Buffer.alloc(32);
  buf.writeUInt8(CONTROL_TYPE.INJECT_TOUCH_EVENT, 0);
  buf.writeUInt8(action & 0xff, 1);
  buf.writeBigUInt64BE(toU64PointerId(pointerId), 2);
  buf.writeInt32BE(Math.round(x), 10);
  buf.writeInt32BE(Math.round(y), 14);
  buf.writeUInt16BE(Math.max(0, Math.round(videoWidth)), 18);
  buf.writeUInt16BE(Math.max(0, Math.round(videoHeight)), 20);
  buf.writeUInt16BE(floatToU16Fp(pressure), 22);
  buf.writeInt32BE(actionButton, 24);
  buf.writeInt32BE(buttons, 28);
  return buf;
};

/**
 * 注入滚轮事件（INJECT_SCROLL_EVENT）。
 *
 * hscroll/vscroll 取值范围 [-16,16]（对照 scrcpy control_msg.c：先 /16 截到 [-1,1] 再编码），
 * 正 vscroll 表示向上滚动。
 *
 * @param {object} options
 * @param {number} options.x
 * @param {number} options.y
 * @param {number} options.videoWidth
 * @param {number} options.videoHeight
 * @param {number} options.hscroll
 * @param {number} options.vscroll
 * @param {number} [options.buttons=0]
 * @returns {Buffer}
 */
export const injectScroll = ({
  x,
  y,
  videoWidth,
  videoHeight,
  hscroll,
  vscroll,
  buttons = 0,
}) => {
  const buf = Buffer.alloc(21);
  buf.writeUInt8(CONTROL_TYPE.INJECT_SCROLL_EVENT, 0);
  buf.writeInt32BE(Math.round(x), 1);
  buf.writeInt32BE(Math.round(y), 5);
  buf.writeUInt16BE(Math.max(0, Math.round(videoWidth)), 9);
  buf.writeUInt16BE(Math.max(0, Math.round(videoHeight)), 11);
  buf.writeInt16BE(floatToI16Fp(hscroll / 16), 13);
  buf.writeInt16BE(floatToI16Fp(vscroll / 16), 15);
  buf.writeInt32BE(buttons, 17);
  return buf;
};

/**
 * 返回键/点亮屏幕（BACK_OR_SCREEN_ON）
 *
 * @param {number} action - ACTION_DOWN / ACTION_UP。
 * @returns {Buffer}
 */
export const backOrScreenOn = (action) => {
  const buf = Buffer.alloc(2);
  buf.writeUInt8(CONTROL_TYPE.BACK_OR_SCREEN_ON, 0);
  buf.writeUInt8(action, 1);
  return buf;
};

/**
 * 设置设备剪贴板（SET_CLIPBOARD）
 *
 * @param {object} options
 * @param {string} options.text
 * @param {boolean} [options.paste=false] - 设置后立即触发粘贴。
 * @param {bigint} [options.sequence=0n]
 * @returns {Buffer}
 */
export const setClipboard = ({ text, paste = false, sequence = 0n }) => {
  const payload = Buffer.from(String(text), 'utf8');
  const buf = Buffer.alloc(14 + payload.length);
  buf.writeUInt8(CONTROL_TYPE.SET_CLIPBOARD, 0);
  buf.writeBigUInt64BE(BigInt.asUintN(64, BigInt(sequence)), 1);
  buf.writeUInt8(paste ? 1 : 0, 9);
  buf.writeUInt32BE(payload.length, 10);
  payload.copy(buf, 14);
  return buf;
};

/**
 * 请求设备剪贴板（GET_CLIPBOARD）
 *
 * @param {number} [copyKey=0] - 0 任意、1 主剪贴板。
 * @returns {Buffer}
 */
export const getClipboard = (copyKey = 0) => {
  const buf = Buffer.alloc(2);
  buf.writeUInt8(CONTROL_TYPE.GET_CLIPBOARD, 0);
  buf.writeUInt8(copyKey, 1);
  return buf;
};

/**
 * 启动指定应用（START_APP），name 为包名或应用名
 *
 * @param {string} name
 * @returns {Buffer}
 */
export const startApp = (name) => {
  const payload = Buffer.from(String(name), 'utf8');
  const buf = Buffer.alloc(2 + payload.length);
  buf.writeUInt8(CONTROL_TYPE.START_APP, 0);
  buf.writeUInt8(payload.length, 1);
  payload.copy(buf, 2);
  return buf;
};

/** @returns {Buffer} */
export const resetVideo = () => Buffer.from([CONTROL_TYPE.RESET_VIDEO]);

/** @returns {Buffer} */
export const rotateDevice = () => Buffer.from([CONTROL_TYPE.ROTATE_DEVICE]);

/** @returns {Buffer} */
export const collapsePanels = () => Buffer.from([CONTROL_TYPE.COLLAPSE_PANELS]);

/**
 * 开关虚拟屏/显示（SET_DISPLAY_POWER）
 *
 * @param {boolean} on
 * @returns {Buffer}
 */
export const setDisplayPower = (on) => Buffer.from([CONTROL_TYPE.SET_DISPLAY_POWER, on ? 1 : 0]);

/**
 * 调整虚拟屏分辨率（RESIZE_DISPLAY），配合 flex_display 实现画面跟随窗口
 *
 * @param {number} width
 * @param {number} height
 * @returns {Buffer}
 */
export const resizeDisplay = (width, height) => {
  const buf = Buffer.alloc(5);
  buf.writeUInt8(CONTROL_TYPE.RESIZE_DISPLAY, 0);
  buf.writeUInt16BE(Math.max(0, Math.round(width)), 1);
  buf.writeUInt16BE(Math.max(0, Math.round(height)), 3);
  return buf;
};

/**
 * 结构化输入消息分发编码。
 *
 * @param {object} message - 渲染端发来的输入消息：
 *   - `{ type: 'touch', action, pointerId, x, y, videoWidth, videoHeight, pressure }`
 *   - `{ type: 'scroll', x, y, videoWidth, videoHeight, hscroll, vscroll }`
 *   - `{ type: 'keycode', action, keycode, metaState? }`
 *   - `{ type: 'text', text }`
 *   - `{ type: 'back', action }`
 *   - `{ type: 'reset-video' } | { type: 'rotate' } | { type: 'collapse-panels' }`
 *   - `{ type: 'resize-display', width, height }`
 *   - `{ type: 'set-clipboard', text, paste? }` | `{ type: 'get-clipboard', copyKey? }`
 * @returns {Buffer}
 */
export const encodeControlMessage = (message) => {
  switch (message?.type) {
  case 'touch':
    return injectTouch(message);
  case 'scroll':
    return injectScroll(message);
  case 'keycode':
    return injectKeycode(message);
  case 'text':
    return injectText(message.text);
  case 'back':
    return backOrScreenOn(message.action);
  case 'reset-video':
    return resetVideo();
  case 'rotate':
    return rotateDevice();
  case 'collapse-panels':
    return collapsePanels();
  case 'resize-display':
    return resizeDisplay(message.width, message.height);
  case 'set-clipboard':
    return setClipboard({ text: message.text, paste: message.paste === true });
  case 'get-clipboard':
    return getClipboard(message.copyKey ?? 0);
  default:
    throw new Error(`未知输入消息类型: ${message?.type}`);
  }
};

/**
 * 控制通道回包解析（设备 → 电脑方向）。
 *
 * 回包格式：1B 类型（0=剪贴板）+ 4B 长度 + 负载；剪贴板自动同步与
 * GET_CLIPBOARD 的应答都走该通道。
 *
 * @typedef {object} ControlReply
 * @property {'clipboard'} type
 * @property {string} text
 */
export class ControlReplyParser {
  constructor() {
    this.buffer = Buffer.alloc(0);
  }

  /**
   * 累积控制 socket 数据，返回解析出的回包列表
   *
   * @param {Buffer|Uint8Array} chunk
   * @returns {ControlReply[]}
   */
  push(chunk) {
    const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.buffer = this.buffer.length === 0 ? incoming : Buffer.concat([this.buffer, incoming]);
    const replies = [];
    while (this.buffer.length >= 5) {
      const type = this.buffer.readUInt8(0);
      const length = this.buffer.readUInt32BE(1);
      if (this.buffer.length < 5 + length) {
        break;
      }
      const payload = this.buffer.subarray(5, 5 + length);
      this.buffer = this.buffer.subarray(5 + length);
      if (type === 0) {
        replies.push({ type: 'clipboard', text: payload.toString('utf8') });
      }
    }
    return replies;
  }
}
