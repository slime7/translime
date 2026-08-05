const shortcutModifiers = new Set([
  'ctrl',
  'control',
  'alt',
  'shift',
  'super',
  'meta',
  'cmd',
  'command',
]);

/**
 * 规范化快捷键字符串，统一分隔与平台别名。
 *
 * @param {string} [accelerator=''] - 原始快捷键字符串。
 * @returns {string} 返回规范化后的快捷键字符串。
 */
export function normalizeShortcut(accelerator = '') {
  return accelerator
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part === 'Win' ? 'Super' : part))
    .join('+');
}

/**
 * 判断快捷键是否仍处于“不完整，只包含修饰键”的状态。
 *
 * @param {string} [accelerator=''] - 待检查的快捷键字符串。
 * @returns {boolean} 若快捷键为空或最后一个片段仍是修饰键，则返回 `true`。
 */
export function isIncompleteShortcut(accelerator = '') {
  const parts = accelerator.split('+').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) {
    return true;
  }

  const lastPart = parts[parts.length - 1].toLowerCase();
  return shortcutModifiers.has(lastPart);
}
