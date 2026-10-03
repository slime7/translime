import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import createSyncQueue from '../../src/utils/sync/queue';

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('createSyncQueue 串行执行', () => {
  it('同步运行期间的再次触发排队，当前轮结束后串行补跑（防止并发对账产生交叉的 rclone 调用）', async () => {
    const first = deferred();
    const runOrder = [];
    const run = async () => {
      runOrder.push('start');
      if (runOrder.length === 1) {
        await first.promise;
      }
      runOrder.push('end');
    };
    const queue = createSyncQueue({ run });

    expect(queue.trigger()).toBe('started');
    expect(queue.trigger()).toBe('queued');
    expect(queue.getState().running).toBe(true);

    first.resolve();
    await vi.waitFor(() => {
      expect(runOrder).toEqual(['start', 'end', 'start', 'end']);
    });
    expect(queue.getState().running).toBe(false);
  });

  it('canRun 返回 false 时触发被忽略（未配置远程目标时不得启动 rclone）', async () => {
    const run = vi.fn();
    const queue = createSyncQueue({ run, canRun: () => false });

    expect(queue.trigger()).toBe('ignored');
    expect(run).not.toHaveBeenCalled();
  });

  it('手动触发的失败不自动重试，队列回到空闲后可再次触发（失败交给 UI 展示而非后台反复放大）', async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      const run = vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('remote unreachable');
        }
      });
      const queue = createSyncQueue({ run });

      expect(queue.trigger()).toBe('started');
      await vi.advanceTimersByTimeAsync(0);
      // 失败后不安排重试，直接回到空闲
      expect(queue.getState()).toEqual({ running: false, pending: false });

      await vi.advanceTimersByTimeAsync(10 * 60000);
      expect(run).toHaveBeenCalledTimes(1);

      // 用户再次手动触发可以重跑
      expect(queue.trigger()).toBe('started');
      await vi.advanceTimersByTimeAsync(0);
      expect(run).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
