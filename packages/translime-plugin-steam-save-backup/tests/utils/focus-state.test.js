import { describe, expect, it } from 'vitest';
import { createFocusStateResolver } from '../../src/utils/focus-state';

/**
 * 手动时钟 + 手动定时器：advance 按到期顺序执行定时器（与 auto-backup
 * 测试同一套约定，vitest 假时钟不接管 Date，自管更确定）。
 */
const setupResolver = ({ initialState = false, settleMs = 100, onChange } = {}) => {
  const changes = [];
  let clock = 0;
  let nextId = 1;
  const timerTable = new Map();

  const resolver = createFocusStateResolver({
    initialState,
    settleMs,
    onChange: onChange || ((value) => changes.push(value)),
    setTimer: (fn, ms) => {
      const id = nextId;
      nextId += 1;
      timerTable.set(id, { fn, at: clock + ms });
      return id;
    },
    clearTimer: (id) => timerTable.delete(id),
  });

  const advance = (ms) => {
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
      due[1].fn();
    }
    clock = target;
  };

  return { resolver, advance, changes };
};

describe('createFocusStateResolver', () => {
  it('新状态持续稳定防抖时长后才切换（防止 alt-tab 掠过宿主窗口误触发暂停/恢复）', () => {
    const { resolver, advance, changes } = setupResolver({ initialState: true });

    resolver.apply(false);
    advance(50);
    expect(changes).toEqual([]);

    advance(50);
    expect(changes).toEqual([false]);
  });

  it('防抖期内回到原状态则取消切换（瞬时焦点抖动不生效）', () => {
    const { resolver, advance, changes } = setupResolver({ initialState: true });

    resolver.apply(false);
    advance(60);
    resolver.apply(true);
    advance(100);
    expect(changes).toEqual([]);
  });

  it('防抖期内重复的相反输入重置等待窗口（状态需持续稳定而非累计出现）', () => {
    const { resolver, advance, changes } = setupResolver({ initialState: true });

    resolver.apply(false);
    advance(60);
    resolver.apply(false);
    advance(60);
    expect(changes).toEqual([]);

    advance(40);
    expect(changes).toEqual([false]);
  });

  it('回焦与失焦双向都需要防抖确认', () => {
    const { resolver, advance, changes } = setupResolver({ initialState: false });

    resolver.apply(true);
    advance(100);
    expect(changes).toEqual([true]);

    resolver.apply(false);
    advance(100);
    expect(changes).toEqual([true, false]);
  });

  it('与当前状态一致的输入不产生回调', () => {
    const { resolver, advance, changes } = setupResolver({ initialState: false });

    resolver.apply(false);
    advance(100);
    expect(changes).toEqual([]);
  });

  it('cancel 之后不再回调（插件卸载后挂起的切换必须停表）', () => {
    const { resolver, advance, changes } = setupResolver({ initialState: true });

    resolver.apply(false);
    resolver.cancel();
    advance(1000);
    expect(changes).toEqual([]);
  });
});
