/**
 * 串行同步队列（docs/auto-sync-research.md §2 离线容忍）：
 * - 同一时刻只执行一次同步，运行期间的触发排队，结束后补跑
 * - 自动触发的失败按指数退避重试（30s → 1m → 2m，上限 5m）；手动触发清除等待中的重试立即执行
 *   且手动触发的失败不安排自动重试
 */

const createSyncQueue = ({
  run,
  canRun = () => true,
  maxAutoRetries = 3,
  baseRetryDelayMs = 30000,
  maxRetryDelayMs = 300000,
  timers = { setTimeout, clearTimeout },
} = {}) => {
  let running = false;
  let pendingReason = null;
  let retryTimer = null;
  let retryAttempt = 0;
  const listeners = new Set();

  const getState = () => ({
    running,
    pending: pendingReason !== null,
    retryScheduled: retryTimer !== null,
    retryAttempt,
  });

  const notify = () => {
    listeners.forEach((listener) => {
      listener(getState());
    });
  };

  const execute = async (reason) => {
    running = true;
    notify();
    let ok = true;
    try {
      await run(reason);
    } catch {
      ok = false;
    }
    running = false;

    if (pendingReason) {
      const next = pendingReason;
      pendingReason = null;
      notify();
      await execute(next);
      return;
    }

    if (ok) {
      retryAttempt = 0;
    } else if (reason !== 'manual' && retryAttempt < maxAutoRetries) {
      retryAttempt += 1;
      const delay = Math.min(baseRetryDelayMs * 2 ** (retryAttempt - 1), maxRetryDelayMs);
      retryTimer = timers.setTimeout(() => {
        retryTimer = null;
        // 重试到期时如果恰有新一轮同步在跑（手动触发抢先），转为排队等待其结束
        if (running) {
          pendingReason = pendingReason || 'auto';
          notify();
          return;
        }
        execute('auto');
      }, delay);
    }
    notify();
  };

  const trigger = (reason = 'auto') => {
    if (!canRun()) {
      return 'ignored';
    }
    if (running) {
      pendingReason = reason;
      notify();
      return 'queued';
    }
    if (retryTimer) {
      if (reason !== 'manual') {
        return 'queued';
      }
      timers.clearTimeout(retryTimer);
      retryTimer = null;
      retryAttempt = 0;
    }
    execute(reason);
    return 'started';
  };

  const clearRetry = () => {
    if (retryTimer) {
      timers.clearTimeout(retryTimer);
      retryTimer = null;
      retryAttempt = 0;
      notify();
    }
  };

  const subscribe = (listener) => {
    listeners.add(listener);
    listener(getState());
    return () => listeners.delete(listener);
  };

  return {
    trigger,
    clearRetry,
    subscribe,
    getState,
  };
};

export default createSyncQueue;
