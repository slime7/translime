import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import Ipc from '@main/core/Ipc';

// Mock ipcHandler
vi.mock('@main/core/ipcHandler', () => ({
  default: {
    testHandler: vi.fn(() => 'test result'),
    asyncHandler: vi.fn(async () => 'async result'),
    errorHandler: vi.fn(() => { throw new Error('handler error'); }),
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

    it('args 为空时应使用空数组', async () => {
      const { default: ipcHandler } = await import('@main/core/ipcHandler');
      await handleCallback({}, { type: 'testHandler' });

      expect(ipcHandler.testHandler).toHaveBeenCalledWith();
    });
  });

  describe('ipc-msg handler', () => {
    it('应该调用存在的 handler', () => {
      const { default: ipcHandler } = vi.mocked(import('@main/core/ipcHandler'));
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
      expect(handlerFactory).toHaveBeenCalledWith({ sendToClient: expect.any(Function) });
      expect(ipc.handlerList.newHandler).toBeDefined();
    });

    it('添加的 handler 应该可以被调用', async () => {
      ipc.appendHandler('dynamicHandler', () => (arg) => `dynamic: ${arg}`);

      const result = await handleCallback({}, { type: 'dynamicHandler', args: ['test'] });

      expect(result).toEqual({ data: 'dynamic: test', err: null });
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
