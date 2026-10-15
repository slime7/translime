/**
 * DOM `KeyboardEvent.code` → Android keycode 映射（scrcpy 默认键盘注入模式的等价表）。
 *
 * 无映射的可打印字符由调用方回落到 INJECT_TEXT 文本注入（覆盖中文 IME 组合输入）。
 */

/** Android KeyEvent META_* 修饰位 */
export const META_SHIFT_ON = 0x00000001;
export const META_ALT_ON = 0x00000002;
export const META_CTRL_ON = 0x00001000;
export const META_META_ON = 0x00010000;

const CODE_TO_KEYCODE = {
  // 字母 A-Z：29-54
  ...Object.fromEntries(Array.from({ length: 26 }, (_, i) => [`Key${String.fromCharCode(65 + i)}`, 29 + i])),
  // 数字 0-9：7-16
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`Digit${i}`, 7 + i])),
  Enter: 66,
  Backspace: 67,
  Delete: 112,
  Tab: 61,
  Space: 62,
  Escape: 111,
  ArrowUp: 19,
  ArrowDown: 20,
  ArrowLeft: 21,
  ArrowRight: 22,
  Home: 122,
  End: 123,
  PageUp: 92,
  PageDown: 93,
  Insert: 124,
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, 131 + i])),
  ShiftLeft: 59,
  ShiftRight: 60,
  ControlLeft: 129,
  ControlRight: 130,
  AltLeft: 57,
  AltRight: 58,
  MetaLeft: 117,
  MetaRight: 118,
  CapsLock: 115,
  NumLock: 143,
  ScrollLock: 116,
  Semicolon: 74,
  Apostrophe: 75,
  Slash: 76,
  Backslash: 73,
  Comma: 55,
  Period: 56,
  Minus: 69,
  Equal: 70,
  Backquote: 68,
  BracketLeft: 71,
  BracketRight: 72,
  ContextMenu: 82,
  // 小键盘
  Numpad0: 144,
  Numpad1: 145,
  Numpad2: 146,
  Numpad3: 147,
  Numpad4: 148,
  Numpad5: 149,
  Numpad6: 150,
  Numpad7: 151,
  Numpad8: 152,
  Numpad9: 153,
  NumpadDivide: 154,
  NumpadMultiply: 155,
  NumpadSubtract: 156,
  NumpadAdd: 157,
  NumpadDecimal: 158,
  NumpadEnter: 160,
};

/**
 * 查询 event.code 对应的 Android keycode，无映射返回 null
 *
 * @param {string} code - KeyboardEvent.code。
 * @returns {number|null}
 */
export const keycodeForCode = (code) => CODE_TO_KEYCODE[code] ?? null;

/**
 * 从键盘事件合成 Android metaState
 *
 * @param {object} options
 * @param {boolean} [options.ctrlKey]
 * @param {boolean} [options.shiftKey]
 * @param {boolean} [options.altKey]
 * @param {boolean} [options.metaKey]
 * @returns {number}
 */
export const metaStateForEvent = ({
  ctrlKey, shiftKey, altKey, metaKey,
}) => (
  (ctrlKey ? META_CTRL_ON : 0)
  | (shiftKey ? META_SHIFT_ON : 0)
  | (altKey ? META_ALT_ON : 0)
  | (metaKey ? META_META_ON : 0)
);
