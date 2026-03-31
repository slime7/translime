import {
  describe, expect, it,
} from 'vitest';
import {
  isIncompleteShortcut,
  normalizeShortcut,
} from '../../src/main/shortcut-state';

describe('shortcut-state', () => {
  it('应将 Win 规范化为 Super', () => {
    expect(normalizeShortcut('Win + Shift + S')).toBe('Super+Shift+S');
  });

  it('应去除多余空格和空片段', () => {
    expect(normalizeShortcut(' Ctrl +  + Alt + A ')).toBe('Ctrl+Alt+A');
  });

  it('仅修饰键时应视为不完整快捷键', () => {
    expect(isIncompleteShortcut('Ctrl+Shift')).toBe(true);
  });

  it('带实际按键时不应视为不完整快捷键', () => {
    expect(isIncompleteShortcut('Ctrl+Shift+S')).toBe(false);
  });
});
