import { describe, expect, it } from 'vitest';
import createAutoBackupScheduler from '../../src/utils/auto-backup';

/**
 * 手动时钟 + 手动定时器表驱动调度器：advance 按到期顺序执行定时器，
 * 回调里新排的定时器若同样到期会被继续执行（vitest 假时钟不接管 Date，自管更确定）。
 */
const setupScheduler = ({ debounceMs = 100, cooldownMs = 500, run } = {}) => {
  const runs = [];
  let clock = 0;
  let nextId = 1;
  const timerTable = new Map();

  const scheduler = createAutoBackupScheduler({
    debounceMs,
    cooldownMs,
    now: () => clock,
    setTimer: (fn, ms) => {
      const id = nextId;
      nextId += 1;
      timerTable.set(id, { fn, at: clock + ms });
      return id;
    },
    clearTimer: (id) => timerTable.delete(id),
    run: run || (async (gameId) => {
      runs.push({ gameId, at: clock });
    }),
  });

  const advance = async (ms) => {
    const target = clock + ms;
    for (;;) {
      const due = [...timerTable.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) {
        break;
      }
      clock = due[1].at;
      timerTable.delete(due[0]);
      // 时钟推进器必须等回调执行完（回调可能重排新定时器），顺序 await 是本测试工具的语义
      // eslint-disable-next-line no-await-in-loop
      await due[1].fn();
    }
    clock = target;
  };

  return { runs, scheduler, advance };
};

describe('createAutoBackupScheduler', () => {
  it('变更后经防抖静默期才执行一次备份（连续写入合并，不逐文件触发）', async () => {
    const { runs, scheduler, advance } = setupScheduler();

    scheduler.notifyChange('g1');
    await advance(50);
    expect(runs).toEqual([]);

    await advance(50);
    expect(runs).toEqual([{ gameId: 'g1', at: 100 }]);
  });

  it('防抖期内的新变更重置静默期（只在真正安静后备份）', async () => {
    const { runs, scheduler, advance } = setupScheduler();

    scheduler.notifyChange('g1');
    await advance(50);
    scheduler.notifyChange('g1');
    await advance(50);
    expect(runs).toEqual([]);

    await advance(50);
    expect(runs).toEqual([{ gameId: 'g1', at: 150 }]);
  });

  it('冷却期内的新变更合并为冷却结束后的补跑（游玩期间不产生备份版本爆炸）', async () => {
    const { runs, scheduler, advance } = setupScheduler();

    scheduler.notifyChange('g1');
    await advance(100);
    expect(runs).toEqual([{ gameId: 'g1', at: 100 }]);

    // 冷却期内再次变更：不立即执行
    scheduler.notifyChange('g1');
    await advance(100);
    expect(runs).toEqual([{ gameId: 'g1', at: 100 }]);

    // 冷却结束（上次备份后 500ms，即 t=600）后补跑一次，捕获冷却期内的最终状态
    await advance(400);
    expect(runs).toEqual([
      { gameId: 'g1', at: 100 },
      { gameId: 'g1', at: 600 },
    ]);
  });

  it('冷却期内多次变更只补跑一次（trailing 定时器不重置）', async () => {
    const { runs, scheduler, advance } = setupScheduler();

    scheduler.notifyChange('g1');
    await advance(100);

    scheduler.notifyChange('g1');
    await advance(100);
    scheduler.notifyChange('g1');
    await advance(100);
    scheduler.notifyChange('g1');
    await advance(300);

    expect(runs).toEqual([
      { gameId: 'g1', at: 100 },
      { gameId: 'g1', at: 600 },
    ]);
  });

  it('备份执行期间收到变更 → 执行完成后按防抖补跑（刚结束的备份可能没读到该写入）', async () => {
    let releaseRun;
    let firstCall = true;
    const { runs, scheduler, advance } = setupScheduler({
      run: (gameId) => {
        // 第一次调用挂起（模拟慢备份），后续调用立即完成
        if (firstCall) {
          firstCall = false;
          return new Promise((resolve) => {
            releaseRun = () => {
              runs.push({ gameId, at: 0 });
              resolve();
            };
          });
        }
        runs.push({ gameId, at: 0 });
        return Promise.resolve();
      },
    });

    scheduler.notifyChange('g1');
    // advance 调用即同步启动 execute（run 挂起，releaseRun 未调用）
    const first = advance(100);
    // 执行期间到达的变更进入积压
    scheduler.notifyChange('g1');
    releaseRun();
    await first;
    expect(runs).toEqual([{ gameId: 'g1', at: 0 }]);

    // 积压变更按防抖补跑一次
    await advance(100);
    expect(runs).toEqual([
      { gameId: 'g1', at: 0 },
      { gameId: 'g1', at: 0 },
    ]);
  });

  it('不同游戏互不影响，各自独立防抖与冷却', async () => {
    const { runs, scheduler, advance } = setupScheduler();

    scheduler.notifyChange('g1');
    scheduler.notifyChange('g2');
    await advance(100);

    expect(runs).toEqual([
      { gameId: 'g1', at: 100 },
      { gameId: 'g2', at: 100 },
    ]);
  });

  it('cancel 之后不再执行任何备份（插件卸载必须停表）', async () => {
    const { runs, scheduler, advance } = setupScheduler();

    scheduler.notifyChange('g1');
    scheduler.cancel();
    await advance(1000);

    expect(runs).toEqual([]);
  });

  it('备份抛错不影响后续调度（冷却结束的补跑照常触发）', async () => {
    let attempts = 0;
    const { scheduler, advance } = setupScheduler({
      run: async () => {
        attempts += 1;
        throw new Error('backup failed');
      },
    });

    scheduler.notifyChange('g1');
    await advance(100);
    expect(attempts).toBe(1);

    // 冷却期内的变更合并为冷却结束后的补跑
    scheduler.notifyChange('g1');
    await advance(500);
    expect(attempts).toBe(2);
  });
});
