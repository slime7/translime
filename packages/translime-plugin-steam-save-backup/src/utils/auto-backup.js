/**
 * 自动备份调度器：文件变更 → 每游戏防抖合并 → 执行备份。
 * 游戏游玩期间存档会高频写入，为避免备份版本爆炸：
 * - 每游戏设最小冷却间隔，冷却期内的新变更不立即执行，合并为冷却结束后的补跑（trailing），
 *   保证冷却期内的最终状态仍被捕获
 * - 备份执行期间再收到变更，执行完成后按防抖补跑一次
 */
const createAutoBackupScheduler = ({
  debounceMs = 3000,
  cooldownMs = 10 * 60 * 1000,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (timer) => clearTimeout(timer),
  run,
}) => {
  if (!run) {
    throw new Error('createAutoBackupScheduler 需要提供 run');
  }

  const timers = new Map(); // gameId -> { timer, kind: 'debounce' | 'trailing' }
  const lastRunAt = new Map();
  const pending = new Set();
  const running = new Set();

  const clearGameTimer = (gameId) => {
    const entry = timers.get(gameId);
    if (entry) {
      clearTimer(entry.timer);
      timers.delete(gameId);
    }
  };

  const execute = async (gameId) => {
    running.add(gameId);
    try {
      await run(gameId);
    } catch {
      // 备份失败不影响调度；下一次变更会再次尝试
    } finally {
      running.delete(gameId);
      lastRunAt.set(gameId, now());
    }
  };

  // 执行完成后如有积压变更，按防抖再补跑一次（不受冷却约束：刚结束的备份可能没读到该变更）
  const startTimer = (gameId, delay, kind) => {
    clearGameTimer(gameId);
    timers.set(gameId, {
      timer: setTimer(async () => {
        timers.delete(gameId);
        await execute(gameId);
        if (pending.has(gameId)) {
          pending.delete(gameId);
          startTimer(gameId, debounceMs, 'debounce');
        }
      }, delay),
      kind,
    });
  };

  // 变更入口；timer 回调里执行完毕后如有积压变更再排一次（对 startTimer 的回引合法）
  const schedule = (gameId) => {
    if (running.has(gameId)) {
      pending.add(gameId);
      return;
    }
    const last = lastRunAt.get(gameId);
    const elapsed = last == null ? Infinity : now() - last;
    if (elapsed >= cooldownMs) {
      // 冷却已过：常规防抖，静默期后的最后一次变更触发备份
      startTimer(gameId, debounceMs, 'debounce');
      return;
    }
    // 冷却期内：合并为冷却结束后的补跑；已有 trailing 定时器时不重置（提前量保持稳定）
    if (timers.get(gameId)?.kind === 'trailing') {
      return;
    }
    startTimer(gameId, cooldownMs - elapsed, 'trailing');
  };

  return {
    notifyChange: schedule,
    cancel() {
      [...timers.keys()].forEach(clearGameTimer);
      pending.clear();
    },
  };
};

export default createAutoBackupScheduler;
