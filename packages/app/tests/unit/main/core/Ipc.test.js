import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import Ipc from '@main/core/Ipc';
import pluginInterop from '@main/core/pluginInterop';
import { attributeSender } from '@main/core/plugin-loader/pluginSenderRegistry';

// Mock ipcHandler
vi.mock('@main/core/ipcHandler', () => ({
  default: {
    testHandler: vi.fn(() => 'test result'),
    asyncHandler: vi.fn(async () => 'async result'),
    errorHandler: vi.fn(() => {
      throw new Error('handler error');
    }),
  },
}));

vi.mock('electron', () => ({
  webContents: {
    getAllWebContents: vi.fn(() => []),
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

describe('Ipc', () => {
  /** @type {Ipc} */
  let ipc;
  let mockListener;
  let mockSender;
  let handleCallback;
  let onCallback;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ipcMain listener
    mockListener = {
      handle: vi.fn((channel, callback) => {
        if (channel === 'ipc-fn') {
          handleCallback = callback;
        }
      }),
      on: vi.fn((channel, callback) => {
        if (channel === 'ipc-msg') {
          onCallback = callback;
        }
      }),
    };

    // Mock webContents sender
    mockSender = {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    };

    ipc = new Ipc(mockListener, mockSender);
  });

  describe('constructor', () => {
    it('应该注册 ipc-fn handle', () => {
      expect(mockListener.handle).toHaveBeenCalledWith('ipc-fn', expect.any(Function));
    });

    it('应该注册 ipc-msg listener', () => {
      expect(mockListener.on).toHaveBeenCalledWith('ipc-msg', expect.any(Function));
    });
  });

  describe('ipc-fn handler', () => {
    it('应该调用存在的 handler 并返回数据', async () => {
      const result = await handleCallback({}, { type: 'testHandler', args: [] });

      expect(result).toEqual({ data: 'test result', err: null });
    });

    it('应该正确传递参数给 handler', async () => {
      const { default: ipcHandler } = await import('@main/core/ipcHandler');
      await handleCallback({}, { type: 'testHandler', args: ['arg1', 'arg2'] });

      expect(ipcHandler.testHandler).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('应该处理异步 handler', async () => {
      const result = await handleCallback({}, { type: 'asyncHandler', args: [] });

      expect(result).toEqual({ data: 'async result', err: null });
    });

    it('handler 抛出错误时应返回错误信息', async () => {
      const result = await handleCallback({}, { type: 'errorHandler', args: [] });

      expect(result).toEqual({ data: null, err: 'handler error' });
    });

    it('handler 不存在时应返回错误信息', async () => {
      const result = await handleCallback({}, { type: 'nonExistentHandler', args: [] });

      expect(result).toEqual({ data: null, err: 'IPC handler [nonExistentHandler] not found' });
    });

    it('插件通道的 handler 错误应附带插件归属前缀', async () => {
      ipc.appendHandler('boom@translime-plugin-a', () => () => {
        throw new Error('boom');
      }, { owner: 'translime-plugin-a' });

      const result = await handleCallback({}, { type: 'boom@translime-plugin-a', args: [] });

      expect(result).toEqual({ data: null, err: '[translime-plugin-a] boom' });
    });

    it('args 为空时应使用空数组', async () => {
      const { default: ipcHandler } = await import('@main/core/ipcHandler');
      await handleCallback({}, { type: 'testHandler' });

      expect(ipcHandler.testHandler).toHaveBeenCalledWith();
    });
  });

  describe('跨插件调用校验', () => {
    const makeSender = (id) => ({ id, isDestroyed: vi.fn(() => false) });

    it('已归属插件不能调用其他未暴露 libs 插件的通道', async () => {
      const sender = makeSender(101);
      attributeSender(sender, 'translime-plugin-a');
      ipc.appendHandler('data@translime-plugin-b', () => () => 'b-data', { owner: 'translime-plugin-b' });

      const result = await handleCallback({ sender }, { type: 'data@translime-plugin-b', args: [] });

      expect(result.err).toContain('不允许跨插件调用');
    });

    it('已归属插件可以访问暴露了 libs 的插件通道', async () => {
      const sender = makeSender(102);
      attributeSender(sender, 'translime-plugin-a');
      ipc.appendHandler('query@translime-plugin-lib', () => () => 'lib-data', { owner: 'translime-plugin-lib' });
      vi.spyOn(pluginInterop, 'getRegisteredPlugins').mockReturnValue(['translime-plugin-lib']);

      const result = await handleCallback({ sender }, { type: 'query@translime-plugin-lib', args: [] });

      expect(result).toEqual({ data: 'lib-data', err: null });
      pluginInterop.getRegisteredPlugins.mockRestore();
    });

    it('插件可以调用自身通道', async () => {
      const sender = makeSender(103);
      attributeSender(sender, 'translime-plugin-a');
      ipc.appendHandler('self@translime-plugin-a', () => () => 'self-data', { owner: 'translime-plugin-a' });

      const result = await handleCallback({ sender }, { type: 'self@translime-plugin-a', args: [] });

      expect(result).toEqual({ data: 'self-data', err: null });
    });

    it('未归属发送方（宿主窗口）不受跨插件限制', async () => {
      ipc.appendHandler('data@translime-plugin-b', () => () => 'b-data', { owner: 'translime-plugin-b' });

      const result = await handleCallback({ sender: makeSender(104) }, { type: 'data@translime-plugin-b', args: [] });

      expect(result).toEqual({ data: 'b-data', err: null });
    });
  });

  describe('ipc-msg handler', () => {
    it('应该调用存在的 handler', () => {
      onCallback({}, { type: 'testHandler', data: 'test data' });

      // handler 会被调用并传入 data
    });

    it('handler 不存在时不应抛出错误', () => {
      expect(() => {
        onCallback({}, { type: 'nonExistentHandler', data: 'test data' });
      }).not.toThrow();
    });
  });

  describe('sendToClient', () => {
    it('应该向默认 sender 发送消息', () => {
      ipc.sendToClient('test-type', { foo: 'bar' });

      expect(mockSender.send).toHaveBeenCalledWith('ipc-reply', {
        type: 'test-type',
        data: { foo: 'bar' },
      });
    });

    it('应该向指定窗口发送消息', () => {
      const customWin = {
        webContents: {
          isDestroyed: vi.fn(() => false),
          send: vi.fn(),
        },
        isDestroyed: vi.fn(() => false),
      };

      ipc.sendToClient('test-type', 'data', customWin);

      expect(customWin.webContents.send).toHaveBeenCalledWith('ipc-reply', {
        type: 'test-type',
        data: 'data',
      });
    });

    it('sender 已销毁时不应发送消息', () => {
      mockSender.isDestroyed.mockReturnValue(true);

      ipc.sendToClient('test-type', 'data');

      expect(mockSender.send).not.toHaveBeenCalled();
    });

    it('target 为 null 时不应抛出错误', () => {
      const ipcNoSender = new Ipc(mockListener, null);

      expect(() => {
        ipcNoSender.sendToClient('test-type', 'data');
      }).not.toThrow();
    });
  });

  describe('appendHandler', () => {
    it('应该动态添加处理函数', () => {
      const handlerFactory = vi.fn(() => (data) => `handled: ${data}`);

      const result = ipc.appendHandler('newHandler', handlerFactory);

      expect(result).toBe(true);
      expect(handlerFactory).toHaveBeenCalledWith({
        sendToClient: expect.any(Function),
        sendToMain: expect.any(Function),
        sendToAllWindows: expect.any(Function),
      });
      expect(ipc.handlerList.newHandler).toBeDefined();
    });

    it('添加的 handler 应该可以被调用', async () => {
      ipc.appendHandler('dynamicHandler', () => (arg) => `dynamic: ${arg}`);

      const result = await handleCallback({}, { type: 'dynamicHandler', args: ['test'] });

      expect(result).toEqual({ data: 'dynamic: test', err: null });
    });

    it('相同所有者重复注册应该原地替换', () => {
      const first = vi.fn(() => () => 'first');
      const second = vi.fn(() => () => 'second');

      expect(ipc.appendHandler('owned@translime-plugin-a', first, { owner: 'translime-plugin-a' })).toBe(true);
      expect(ipc.appendHandler('owned@translime-plugin-a', second, { owner: 'translime-plugin-a' })).toBe(true);
      expect(ipc.handlerList['owned@translime-plugin-a']()).toBe('second');
    });

    it('插件不能抢占宿主内置通道', () => {
      const originalHandler = ipc.handlerList.testHandler;
      const result = ipc.appendHandler('testHandler', () => () => 'hijacked', { owner: 'translime-plugin-a' });

      expect(result).toBe(false);
      expect(ipc.handlerList.testHandler).toBe(originalHandler);
    });

    it('插件不能注册其他插件已登记的通道', () => {
      ipc.appendHandler('taken@translime-plugin-a', () => () => 'a', { owner: 'translime-plugin-a' });

      const result = ipc.appendHandler('taken@translime-plugin-a', () => () => 'b', { owner: 'translime-plugin-b' });

      expect(result).toBe(false);
      expect(ipc.handlerList['taken@translime-plugin-a']()).toBe('a');
    });

    it('removeHandler 传入非所有者时应该拒绝移除', () => {
      ipc.appendHandler('keep@translime-plugin-a', () => () => 'a', { owner: 'translime-plugin-a' });

      expect(ipc.removeHandler('keep@translime-plugin-a', 'translime-plugin-b')).toBe(false);
      expect(ipc.handlerList['keep@translime-plugin-a']).toBeDefined();

      expect(ipc.removeHandler('keep@translime-plugin-a', 'translime-plugin-a')).toBe(true);
      expect(ipc.handlerList['keep@translime-plugin-a']).toBeUndefined();
    });
  });

  describe('removeHandler', () => {
    it('应该移除存在的处理函数', () => {
      ipc.appendHandler('toRemove', () => () => {});
      expect(ipc.handlerList.toRemove).toBeDefined();

      ipc.removeHandler('toRemove');

      expect(ipc.handlerList.toRemove).toBeUndefined();
    });

    it('移除不存在的 handler 不应抛出错误', () => {
      expect(() => {
        ipc.removeHandler('nonExistent');
      }).not.toThrow();
    });
  });
});
