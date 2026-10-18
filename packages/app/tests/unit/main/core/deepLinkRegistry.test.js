import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import deepLinkRegistry from '@main/core/deepLinkRegistry';

describe('deepLinkRegistry', () => {
  afterEach(() => {
    deepLinkRegistry.clearDeepLinkHandlers('translime-plugin-test');
  });

  it('注册后按路径精确分发事件，路径去首尾斜杠与压连续斜杠后等价（防止合法深链被误判为未注册）', () => {
    const handler = vi.fn();
    deepLinkRegistry.setDeepLinkHandlers('translime-plugin-test', { mirror: handler });

    expect(deepLinkRegistry.dispatch('translime-plugin-test', 'mirror', { serial: 'a' })).toBe(true);
    expect(handler).toHaveBeenCalledWith({ path: 'mirror', params: { serial: 'a' } });

    expect(deepLinkRegistry.dispatch('translime-plugin-test', '/mirror/', {})).toBe(true);
    expect(deepLinkRegistry.dispatch('translime-plugin-test', 'mirror//sub', {})).toBe(false);

    handler.mockClear();
    deepLinkRegistry.setDeepLinkHandlers('translime-plugin-test', { 'a//b': handler });
    expect(deepLinkRegistry.dispatch('translime-plugin-test', 'a/b', {})).toBe(true);
  });

  it('子路径不匹配父路径注册（防止路径前缀误触发无关处理函数）', () => {
    const handler = vi.fn();
    deepLinkRegistry.setDeepLinkHandlers('translime-plugin-test', { mirror: handler });

    expect(deepLinkRegistry.dispatch('translime-plugin-test', 'mirror/extra', {})).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('分发未注册路径或未注册插件时返回 false，不抛错（防止深链打崩宿主）', () => {
    deepLinkRegistry.setDeepLinkHandlers('translime-plugin-test', { mirror: vi.fn() });

    expect(deepLinkRegistry.dispatch('translime-plugin-test', 'other', {})).toBe(false);
    expect(deepLinkRegistry.dispatch('translime-plugin-other', 'mirror', {})).toBe(false);
    expect(deepLinkRegistry.dispatch('', 'mirror', {})).toBe(false);
  });

  it('注册表整体替换且非函数项被忽略（防止上次登记的旧路径继续生效）', () => {
    const first = vi.fn();
    const second = vi.fn();
    deepLinkRegistry.setDeepLinkHandlers('translime-plugin-test', { mirror: first });
    deepLinkRegistry.setDeepLinkHandlers('translime-plugin-test', { other: second, bad: 'not-a-fn' });

    expect(deepLinkRegistry.dispatch('translime-plugin-test', 'mirror', {})).toBe(false);
    expect(deepLinkRegistry.dispatch('translime-plugin-test', 'other', {})).toBe(true);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });

  it('传 null 或空对象清除登记（防止停用语义失效）', () => {
    deepLinkRegistry.setDeepLinkHandlers('translime-plugin-test', { mirror: vi.fn() });
    expect(deepLinkRegistry.setDeepLinkHandlers('translime-plugin-test', null)).toBe(true);
    expect(deepLinkRegistry.dispatch('translime-plugin-test', 'mirror', {})).toBe(false);

    deepLinkRegistry.setDeepLinkHandlers('translime-plugin-test', { mirror: vi.fn() });
    deepLinkRegistry.setDeepLinkHandlers('translime-plugin-test', {});
    expect(deepLinkRegistry.dispatch('translime-plugin-test', 'mirror', {})).toBe(false);
  });

  it('处理函数异常向外抛，由调用方统一捕获（防止插件错误被注册表吞掉无日志）', () => {
    deepLinkRegistry.setDeepLinkHandlers('translime-plugin-test', {
      boom: () => {
        throw new Error('plugin error');
      },
    });
    expect(() => deepLinkRegistry.dispatch('translime-plugin-test', 'boom', {})).toThrow('plugin error');
  });
});
