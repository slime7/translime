import { describe, expect, it } from 'vitest';
import { isChromeRevealed } from '../src/chrome-reveal';

describe('isChromeRevealed', () => {
  const windowSize = { width: 500, height: 800 };

  it('鼠标在窗口外时不显示', () => {
    expect(isChromeRevealed({ ...windowSize, x: -1, y: 100 })).toBe(false);
    expect(isChromeRevealed({ ...windowSize, x: 100, y: -1 })).toBe(false);
    expect(isChromeRevealed({ ...windowSize, x: 501, y: 100 })).toBe(false);
    expect(isChromeRevealed({ ...windowSize, x: 100, y: 801 })).toBe(false);
  });

  it('鼠标靠近顶部标题栏区域时显示', () => {
    expect(isChromeRevealed({ ...windowSize, x: 200, y: 20 })).toBe(true);
    expect(isChromeRevealed({ ...windowSize, x: 200, y: 56 })).toBe(true);
  });

  it('鼠标靠近右侧工具栏区域时显示', () => {
    // 宽 500，阈值 88，x >= 412 时触发
    expect(isChromeRevealed({ ...windowSize, x: 450, y: 300 })).toBe(true);
    expect(isChromeRevealed({ ...windowSize, x: 412, y: 300 })).toBe(true);
  });

  it('鼠标处于中央画面区时隐藏', () => {
    expect(isChromeRevealed({ ...windowSize, x: 200, y: 300 })).toBe(false);
    expect(isChromeRevealed({ ...windowSize, x: 300, y: 400 })).toBe(false);
  });

  it('坐标非数值时安全返回 false', () => {
    expect(isChromeRevealed({ ...windowSize, x: null, y: 20 })).toBe(false);
    expect(isChromeRevealed({ ...windowSize, x: 20, y: undefined })).toBe(false);
  });
});
