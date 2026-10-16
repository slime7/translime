import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { createChromeVisibility } from '../src/chrome-visibility';

describe('createChromeVisibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('显示立即生效，不经过延时（防止显示被挂起导致面板迟迟不出现）', () => {
    const changes = [];
    const controller = createChromeVisibility({ hideDelayMs: 2000, onChange: (v) => changes.push(v) });
    controller.hide();
    vi.advanceTimersByTime(2000);
    expect(changes).toEqual([false]);
    controller.show();
    expect(changes).toEqual([false, true]);
  });

  it('隐藏延迟 2 秒生效（防止移出画面后控制栏闪没）', () => {
    const changes = [];
    const controller = createChromeVisibility({ hideDelayMs: 2000, onChange: (v) => changes.push(v) });
    controller.hide();
    vi.advanceTimersByTime(1999);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([false]);
  });

  it('延迟期内重新显示会取消未生效的隐藏（防止移出又移回后控制栏仍消失）', () => {
    const changes = [];
    const controller = createChromeVisibility({ hideDelayMs: 2000, onChange: (v) => changes.push(v) });
    controller.hide();
    vi.advanceTimersByTime(1000);
    controller.show();
    vi.advanceTimersByTime(3000);
    expect(changes).toEqual([]);
  });

  it('重复隐藏只安排一次延时（防止多次回调与状态错乱）', () => {
    const changes = [];
    const controller = createChromeVisibility({ hideDelayMs: 2000, onChange: (v) => changes.push(v) });
    controller.hide();
    controller.hide();
    vi.advanceTimersByTime(2000);
    expect(changes).toEqual([false]);
  });

  it('dispose 取消未生效的隐藏并复位显示状态（防止会话销毁后仍触发回调）', () => {
    const changes = [];
    const controller = createChromeVisibility({ hideDelayMs: 2000, onChange: (v) => changes.push(v) });
    controller.hide();
    controller.dispose();
    vi.advanceTimersByTime(5000);
    expect(changes).toEqual([]);
    controller.show();
    expect(changes).toEqual([]);
  });
});
