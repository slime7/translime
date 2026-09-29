import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  dispatchMenuAction,
  registerMenu,
} from '@main/core/menuRegistry';

describe('menuRegistry', () => {
  beforeEach(() => {
    // 用尽 FIFO 容量，清空其他用例遗留的登记
    for (let i = 0; i < 20; i += 1) {
      registerMenu(new Map());
    }
  });

  it('登记后应能按 menuId 与菜单项 id 命中处理函数', () => {
    const clicked = vi.fn();
    const menuId = registerMenu(new Map([['item-a', clicked]]));

    const hit = dispatchMenuAction(menuId, 'item-a');

    expect(hit).toBe(true);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('动作消费后二次回传不应再执行', () => {
    const clicked = vi.fn();
    const menuId = registerMenu(new Map([['item-a', clicked]]));

    dispatchMenuAction(menuId, 'item-a');
    const hitAgain = dispatchMenuAction(menuId, 'item-a');

    expect(hitAgain).toBe(false);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('未知 menuId 或未登记的菜单项应返回 false', () => {
    const menuId = registerMenu(new Map([['item-a', vi.fn()]]));

    expect(dispatchMenuAction('host-menu-unknown', 'item-a')).toBe(false);
    expect(dispatchMenuAction(menuId, 'item-missing')).toBe(false);
    expect(dispatchMenuAction(undefined, 'item-a')).toBe(false);
  });

  it('登记超过容量上限时应按 FIFO 淘汰最旧的菜单', () => {
    const evictedClick = vi.fn();
    const evictedId = registerMenu(new Map([['old', evictedClick]]));

    for (let i = 0; i < 20; i += 1) {
      registerMenu(new Map([[`item-${i}`, vi.fn()]]));
    }

    expect(dispatchMenuAction(evictedId, 'old')).toBe(false);
    expect(evictedClick).not.toHaveBeenCalled();
  });
});
