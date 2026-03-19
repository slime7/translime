import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import pluginInterop from '@main/core/pluginInterop';

describe('pluginInterop', () => {
  beforeEach(() => {
    // 清理所有注册状态
    pluginInterop.getRegisteredPlugins().forEach((id) => {
      pluginInterop.unregister(id);
    });
    // 清理所有事件监听
    pluginInterop.removeAllListeners();
  });

  describe('基本机制', () => {
    it('应在注册时发出 activated 事件', () => {
      const listener = vi.fn();
      pluginInterop.on('activated', listener);

      const mockExports = { foo: 'bar' };
      pluginInterop.register('plugin-a', mockExports);

      expect(listener).toHaveBeenCalledWith('plugin-a', mockExports);
      expect(pluginInterop.getExports('plugin-a')).toBe(mockExports);
      expect(pluginInterop.getRegisteredPlugins()).toContain('plugin-a');
    });

    it('应在注销时发出 deactivated 事件', () => {
      const listener = vi.fn();
      pluginInterop.on('deactivated', listener);

      pluginInterop.register('plugin-a', {});
      pluginInterop.unregister('plugin-a');

      expect(listener).toHaveBeenCalledWith('plugin-a');
      expect(pluginInterop.getExports('plugin-a')).toBeUndefined();
      expect(pluginInterop.getRegisteredPlugins()).not.toContain('plugin-a');
    });

    it('如果为未注册的插件调用注销，不应触发 deactivated', () => {
      const listener = vi.fn();
      pluginInterop.on('deactivated', listener);

      pluginInterop.unregister('not-exist');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('waitForPlugin', () => {
    it('目标已注册时立即 resolver', async () => {
      const mockExports = { val: 42 };
      pluginInterop.register('plugin-b', mockExports);

      const result = await pluginInterop.waitForPlugin('plugin-b');
      expect(result).toBe(mockExports);
    });

    it('目标未注册时应等待 activated', async () => {
      const mockExports = { val: 42 };

      const waitPromise = pluginInterop.waitForPlugin('plugin-wait');

      // 模拟一段时间后注册
      setTimeout(() => {
        pluginInterop.register('plugin-wait', mockExports);
      }, 10);

      const result = await waitPromise;
      expect(result).toBe(mockExports);
    });

    it('超时应被 reject', async () => {
      await expect(pluginInterop.waitForPlugin('plugin-timeout', 10)).rejects.toThrow('等待插件 "plugin-timeout" 激活超时');
    });

    it('如果 timeout=0，应永不超时', async () => {
      const mockExports = { val: 42 };
      const waitPromise = pluginInterop.waitForPlugin('plugin-no-timeout', 0);

      setTimeout(() => {
        pluginInterop.register('plugin-no-timeout', mockExports);
      }, 50);

      const result = await waitPromise;
      expect(result).toBe(mockExports);
    });
  });
});
