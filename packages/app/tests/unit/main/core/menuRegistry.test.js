import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  dispatchMenuAction,
  registerMenu,
} from '@main/core/menuRegistry';

// menuRegistry 引入 logger 记录异步动作失败，其模块链需要 electron 与 store 桩
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'C:/mock-userdata'),
  },
}));

vi.mock('@main/utils/useMainStore', () => ({
  default: {
    config: {
      get: vi.fn((key, defaultValue) => defaultValue),
      set: vi.fn(),
    },
    APP_VERSION: '0.0.0-test',
    APPDATA_PATH: 'C:/mock-userdata',
    TEMP_DIR: 'C:/mock-temp',
  },
}));

vi.mock('@main/utils/logger', () => ({
  default: {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

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

  it('异步动作的拒绝应被捕获并落日志，不产生未处理 rejection', async () => {
    const { default: logger } = await import('@main/utils/logger');
    const failingAction = vi.fn(() => Promise.reject(new Error('async boom')));
    const menuId = registerMenu(new Map([['item-async', failingAction]]));

    expect(dispatchMenuAction(menuId, 'item-async')).toBe(true);

    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('item-async'),
        expect.any(Error),
      );
    });
  });

  it('同步动作抛错应被捕获并落日志，不影响返回值', async () => {
    const { default: logger } = await import('@main/utils/logger');
    const failingAction = vi.fn(() => {
      throw new Error('sync boom');
    });
    const menuId = registerMenu(new Map([['item-sync', failingAction]]));

    expect(dispatchMenuAction(menuId, 'item-sync')).toBe(true);
    expect(logger.error).toHaveBeenCalled();
  });
});
