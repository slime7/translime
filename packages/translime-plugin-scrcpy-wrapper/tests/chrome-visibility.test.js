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

  it('支持传入 delayMs 延迟弹出，期间隐藏则取消显示', () => {
    const changes = [];
    const controller = createChromeVisibility({ hideDelayMs: 2000, onChange: (v) => changes.push(v) });
    controller.hide();
    vi.advanceTimersByTime(2000);
    expect(changes).toEqual([false]);

    // 无焦点延迟 1 秒弹出
    controller.show({ delayMs: 1000 });
    vi.advanceTimersByTime(500);
    expect(changes).toEqual([false]); // 尚未弹出
    vi.advanceTimersByTime(500);
    expect(changes).toEqual([false, true]); // 1 秒到达，弹出

    // 再次隐藏后测试取消逻辑
    controller.hide();
    vi.advanceTimersByTime(2000);
    expect(changes).toEqual([false, true, false]);
    controller.show({ delayMs: 1000 });
    vi.advanceTimersByTime(500);
    controller.hide(); // 在 1 秒前移开光标
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([false, true, false]); // 未弹出
  });
});
