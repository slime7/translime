import {
  describe, expect, it, vi,
} from 'vitest';
import createResizeScheduler from '../src/resize-scheduler';

/**
 * 用假时钟驱动调度器，返回 { scheduler, advance, pendingCount }：
 * advance(ms) 推进假时钟，触发到期的防抖回调
 */
const createHarness = (debounceMs, hooks = {}) => {
  let now = 0;
  const timers = new Map();
  let seq = 0;
  const scheduler = createResizeScheduler({
    debounceMs,
    onBurstStart: hooks.onBurstStart,
    onSettle: hooks.onSettle,
    scheduleDelay: (callback, ms) => {
      seq += 1;
      timers.set(seq, { at: now + ms, callback });
      return seq;
    },
    cancelDelay: (id) => {
      timers.delete(id);
    },
  });
  return {
    scheduler,
    advance: (ms) => {
      now += ms;
      Array.from(timers.entries())
        .filter(([, timer]) => timer.at <= now)
        .forEach(([id, timer]) => {
          timers.delete(id);
          timer.callback();
        });
    },
    pendingCount: () => timers.size,
  };
};

describe('createResizeScheduler', () => {
  it('首个 resize 事件立即进入拖动批次，防抖到期后结算一次', () => {
    const onBurstStart = vi.fn();
    const onSettle = vi.fn();
    const { scheduler, advance } = createHarness(120, { onBurstStart, onSettle });

    scheduler.notifyResize();
    expect(onBurstStart).toHaveBeenCalledTimes(1);
    expect(onSettle).not.toHaveBeenCalled();

    scheduler.notifyResize();
    scheduler.notifyResize();
    expect(onBurstStart).toHaveBeenCalledTimes(1);

    advance(120);
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  it('批次内的 resize 事件顺延防抖，停止事件后才结算', () => {
    const onSettle = vi.fn();
    const { scheduler, advance } = createHarness(120, { onSettle });

    scheduler.notifyResize();
    advance(100);
    scheduler.notifyResize();
    advance(100);
    expect(onSettle).not.toHaveBeenCalled();
    advance(20);
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  it('防抖等待期间强制 settle 立即结算并取消挂起定时器', () => {
    const onSettle = vi.fn();
    const { scheduler, advance, pendingCount } = createHarness(120, { onSettle });

    scheduler.notifyResize();
    const settled = scheduler.settle();
    expect(settled).toBe(true);
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(pendingCount()).toBe(0);

    advance(200);
    // 定时器已取消，不重复结算
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  it('空闲期 settle 为无操作，不触发 onSettle', () => {
    const onBurstStart = vi.fn();
    const onSettle = vi.fn();
    const { scheduler } = createHarness(120, { onBurstStart, onSettle });

    expect(scheduler.settle()).toBe(false);
    expect(onSettle).not.toHaveBeenCalled();
    expect(onBurstStart).not.toHaveBeenCalled();
  });

  it('settle 后新 resize 事件开启新批次并再次触发 onBurstStart', () => {
    const onBurstStart = vi.fn();
    const onSettle = vi.fn();
    const { scheduler, advance } = createHarness(120, { onBurstStart, onSettle });

    scheduler.notifyResize();
    advance(120);
    scheduler.notifyResize();
    expect(onBurstStart).toHaveBeenCalledTimes(2);

    advance(120);
    expect(onSettle).toHaveBeenCalledTimes(2);
  });

  it('dispose 丢弃挂起定时器，之后不再结算', () => {
    const onSettle = vi.fn();
    const { scheduler, advance } = createHarness(120, { onSettle });

    scheduler.notifyResize();
    scheduler.dispose();
    advance(200);
    expect(onSettle).not.toHaveBeenCalled();

    // dispose 后批次状态复位，重新通知可开启新批次
    scheduler.notifyResize();
    advance(120);
    expect(onSettle).toHaveBeenCalledTimes(1);
  });
});
