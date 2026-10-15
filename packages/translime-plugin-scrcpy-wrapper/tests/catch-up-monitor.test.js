import {
  describe, expect, it, vi,
} from 'vitest';
import createCatchUpMonitor from '../src/catch-up-monitor';

const frameOf = (byte) => ({
  buffer: Buffer.from([byte, byte, byte, byte]),
  width: 1,
  height: 1,
});

/**
 * 用假时钟驱动监视器：帧内容经 setFrame 切换，advance(ms) 按时间序触发
 * 沿途到期的定时回调（回调内新排的定时器也继续处理）
 */
const createHarness = ({ mode, capture } = {}) => {
  let now = 0;
  const timers = new Map();
  let seq = 0;
  let frame = frameOf(1);
  const captureTimes = [];
  const reveal = vi.fn();
  const monitor = createCatchUpMonitor({
    mode,
    capture: capture ?? (() => {
      captureTimes.push(now);
      return frame;
    }),
    reveal,
    now: () => now,
    scheduleDelay: (callback, ms) => {
      seq += 1;
      timers.set(seq, {
        at: now + ms,
        callback,
      });
      return seq;
    },
    cancelDelay: (id) => {
      timers.delete(id);
    },
  });
  return {
    monitor,
    reveal,
    captureTimes: () => captureTimes,
    setFrame: (byte) => {
      frame = frameOf(byte);
    },
    advance: (ms) => {
      const target = now + ms;
      for (;;) {
        const due = Array.from(timers.entries())
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) {
          break;
        }
        now = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
      }
      now = target;
    },
  };
};

describe('createCatchUpMonitor', () => {
  it('timed 模式到时限撤下一次，不重复触发', () => {
    const { monitor, reveal, advance } = createHarness({ mode: 'timed' });

    monitor.start();
    advance(399);
    expect(reveal).not.toHaveBeenCalled();
    advance(1);
    expect(reveal).toHaveBeenCalledTimes(1);
    advance(500);
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it('timed 模式 cancel 后不再撤下', () => {
    const { monitor, reveal, advance } = createHarness({ mode: 'timed' });

    monitor.start();
    monitor.cancel();
    advance(500);
    expect(reveal).not.toHaveBeenCalled();
  });

  it('diff 模式先建基线再比对，内容变化后立即撤下', () => {
    const {
      monitor, reveal, captureTimes, setFrame, advance,
    } = createHarness({ mode: 'diff' });

    monitor.start();
    advance(60);
    // 基线时刻（120ms）之前不抓帧，避免把 settle 重缩放瞬间的内容当基线
    expect(captureTimes()).toEqual([]);
    expect(reveal).not.toHaveBeenCalled();

    advance(60);
    advance(90);
    expect(reveal).not.toHaveBeenCalled();

    setFrame(2);
    advance(90);
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it('diff 模式内容迟迟不变时按时限兜底撤下', () => {
    const { monitor, reveal, advance } = createHarness({ mode: 'diff' });

    monitor.start();
    advance(2000);
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it('diff 模式基线抓帧失败立即撤下，不让覆盖层滞留', () => {
    const { monitor, reveal, advance } = createHarness({ mode: 'diff', capture: () => null });

    monitor.start();
    advance(120);
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it('diff 模式抓帧异常按失败处理', () => {
    const { monitor, reveal, advance } = createHarness({
      mode: 'diff',
      capture: () => {
        throw new Error('capture failed');
      },
    });

    monitor.start();
    advance(120);
    expect(reveal).toHaveBeenCalledTimes(1);
  });
});
