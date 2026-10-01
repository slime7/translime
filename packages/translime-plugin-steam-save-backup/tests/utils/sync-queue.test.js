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
    const run = async (reason) => {
      runOrder.push(`start:${reason}`);
      if (reason === 'backup') {
        await first.promise;
      }
      runOrder.push(`end:${reason}`);
    };
    const queue = createSyncQueue({ run });

    expect(queue.trigger('backup')).toBe('started');
    expect(queue.trigger('manual')).toBe('queued');
    expect(queue.getState().running).toBe(true);

    first.resolve();
    await vi.waitFor(() => {
      expect(runOrder).toEqual(['start:backup', 'end:backup', 'start:manual', 'end:manual']);
    });
    expect(queue.getState().running).toBe(false);
  });

  it('canRun 返回 false 时触发被忽略（同步未启用时不得启动 rclone）', async () => {
    const run = vi.fn();
    const queue = createSyncQueue({ run, canRun: () => false });

    expect(queue.trigger('manual')).toBe('ignored');
    expect(run).not.toHaveBeenCalled();
  });
});

describe('createSyncQueue 失败重试', () => {
  it('自动触发的失败按指数退避自动重试，成功后清零计数（远端短暂离线后自动恢复同步）', async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      const run = vi.fn(async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error('remote unreachable');
        }
      });
      const queue = createSyncQueue({ run, baseRetryDelayMs: 30000 });

      queue.trigger('activate');
      await vi.advanceTimersByTimeAsync(0);
      expect(run).toHaveBeenCalledTimes(1);
      expect(queue.getState().retryScheduled).toBe(true);

      await vi.advanceTimersByTimeAsync(30000);
      expect(run).toHaveBeenCalledTimes(2);
      // 第二次失败已发生，进入第二轮退避（60s）
      expect(queue.getState().retryAttempt).toBe(2);

      await vi.advanceTimersByTimeAsync(60000);
      expect(run).toHaveBeenCalledTimes(3);
      expect(queue.getState().retryAttempt).toBe(0);
      expect(queue.getState().retryScheduled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('手动触发会取消等待中的重试并立即执行（用户点“立即同步”不必等退避计时）', async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn(async () => {
        throw new Error('remote unreachable');
      });
      const queue = createSyncQueue({ run, baseRetryDelayMs: 30000 });

      queue.trigger('activate');
      await vi.advanceTimersByTimeAsync(0);
      expect(queue.getState().retryScheduled).toBe(true);

      queue.trigger('manual');
      await vi.advanceTimersByTimeAsync(0);
      expect(run).toHaveBeenCalledTimes(2);
      expect(queue.getState().retryScheduled).toBe(false);
      expect(queue.getState().retryAttempt).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('手动触发的失败不安排自动重试（避免用户取消外的问题被反复自动放大）', async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn(async () => {
        throw new Error('bad target');
      });
      const queue = createSyncQueue({ run });

      queue.trigger('manual');
      await vi.advanceTimersByTimeAsync(10 * 60000);

      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('自动重试上限后停止重试，等待下一次显式触发（离线数小时不无限轮询）', async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn(async () => {
        throw new Error('remote unreachable');
      });
      const queue = createSyncQueue({ run, maxAutoRetries: 2, baseRetryDelayMs: 30000 });

      queue.trigger('activate');
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30000);
      await vi.advanceTimersByTimeAsync(60000);
      await vi.advanceTimersByTimeAsync(10 * 60000);

      expect(run).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
