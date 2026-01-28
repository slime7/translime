import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

// Mock ipcConstant
vi.mock('@pkg/share/utils/ipcConstant', () => ({
  NET_REQUEST: 'net-request',
  NET_ABORT: 'net-abort',
}));

// Mock electron net module
const { mockRequest, mockResponse } = vi.hoisted(() => {
  const response = {
    statusCode: 200,
    statusMessage: 'OK',
    headers: { 'content-type': 'application/json' },
    on: vi.fn(),
  };

  const request = {
    on: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    abort: vi.fn(),
  };

  return { mockRequest: request, mockResponse: response };
});

vi.mock('electron', () => ({
  net: {
    request: vi.fn(() => mockRequest),
  },
}));

describe('netHandler', () => {
  let netHandler;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mock implementations
    mockRequest.on.mockReset();
    mockRequest.write.mockReset();
    mockRequest.end.mockReset();
    mockRequest.abort.mockReset();
    mockResponse.on.mockReset();

    // Import fresh netHandler for each test
    vi.resetModules();
    const module = await import('@main/core/netHandler');
    netHandler = module.default;
  });

  describe('NET_REQUEST', () => {
    it('应该创建并发送请求', async () => {
      // 模拟成功响应
      mockRequest.on.mockImplementation((event, callback) => {
        if (event === 'response') {
          // 模拟响应事件
          setTimeout(() => {
            mockResponse.on.mockImplementation((respEvent, respCallback) => {
              if (respEvent === 'data') {
                respCallback(Buffer.from('{"success":true}'));
              } else if (respEvent === 'end') {
                respCallback();
              }
            });
            callback(mockResponse);
          }, 0);
        }
      });

      const promise = netHandler['net-request']({
        requestId: 'req-1',
        config: {
          method: 'GET',
          url: 'http://localhost/api',
        },
      });

      const result = await promise;

      expect(result.status).toBe(200);
      expect(result.statusText).toBe('OK');
      expect(result.data).toBe('{"success":true}');
    });

    it('应该正确设置请求头', async () => {
      const { net } = await import('electron');

      mockRequest.on.mockImplementation((event, callback) => {
        if (event === 'response') {
          setTimeout(() => {
            mockResponse.on.mockImplementation((respEvent, respCallback) => {
              if (respEvent === 'end') respCallback();
            });
            callback(mockResponse);
          }, 0);
        }
      });

      await netHandler['net-request']({
        requestId: 'req-2',
        config: {
          method: 'POST',
          url: 'http://localhost/api',
          headers: { 'Content-Type': 'application/json' },
        },
      });

      expect(net.request).toHaveBeenCalledWith(expect.objectContaining({
        method: 'POST',
        url: 'http://localhost/api',
        headers: { 'Content-Type': 'application/json' },
      }));
    });

    it('应该写入请求体', async () => {
      mockRequest.on.mockImplementation((event, callback) => {
        if (event === 'response') {
          setTimeout(() => {
            mockResponse.on.mockImplementation((respEvent, respCallback) => {
              if (respEvent === 'end') respCallback();
            });
            callback(mockResponse);
          }, 0);
        }
      });

      await netHandler['net-request']({
        requestId: 'req-3',
        config: {
          method: 'POST',
          url: 'http://localhost/api',
          data: { foo: 'bar' },
        },
      });

      expect(mockRequest.write).toHaveBeenCalledWith('{"foo":"bar"}');
      expect(mockRequest.end).toHaveBeenCalled();
    });

    it('字符串请求体应直接写入', async () => {
      mockRequest.on.mockImplementation((event, callback) => {
        if (event === 'response') {
          setTimeout(() => {
            mockResponse.on.mockImplementation((respEvent, respCallback) => {
              if (respEvent === 'end') respCallback();
            });
            callback(mockResponse);
          }, 0);
        }
      });

      await netHandler['net-request']({
        requestId: 'req-4',
        config: {
          method: 'POST',
          url: 'http://localhost/api',
          data: 'raw string data',
        },
      });

      expect(mockRequest.write).toHaveBeenCalledWith('raw string data');
    });

    it('arrayBuffer 响应类型应返回 base64 编码', async () => {
      mockRequest.on.mockImplementation((event, callback) => {
        if (event === 'response') {
          setTimeout(() => {
            mockResponse.on.mockImplementation((respEvent, respCallback) => {
              if (respEvent === 'data') {
                respCallback(Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f])); // "Hello"
              } else if (respEvent === 'end') {
                respCallback();
              }
            });
            callback(mockResponse);
          }, 0);
        }
      });

      const result = await netHandler['net-request']({
        requestId: 'req-5',
        config: {
          method: 'GET',
          url: 'http://localhost/api',
          responseType: 'arrayBuffer',
        },
      });

      expect(result.data).toBe(Buffer.from('Hello').toString('base64'));
    });

    it('请求错误应 reject', async () => {
      mockRequest.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => {
            callback(new Error('Network error'));
          }, 0);
        }
      });

      await expect(netHandler['net-request']({
        requestId: 'req-6',
        config: {
          method: 'GET',
          url: 'http://localhost/api',
        },
      })).rejects.toThrow('Network error');
    });

    it('请求被取消应返回 aborted 错误', async () => {
      mockRequest.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => {
            const error = new Error('aborted');
            callback(error);
          }, 0);
        }
      });

      await expect(netHandler['net-request']({
        requestId: 'req-7',
        config: {
          method: 'GET',
          url: 'http://localhost/api',
        },
      })).rejects.toThrow('Request was aborted');
    });

    it('响应错误应 reject', async () => {
      mockRequest.on.mockImplementation((event, callback) => {
        if (event === 'response') {
          setTimeout(() => {
            mockResponse.on.mockImplementation((respEvent, respCallback) => {
              if (respEvent === 'error') {
                respCallback(new Error('Response error'));
              }
            });
            callback(mockResponse);
          }, 0);
        }
      });

      await expect(netHandler['net-request']({
        requestId: 'req-8',
        config: {
          method: 'GET',
          url: 'http://localhost/api',
        },
      })).rejects.toThrow('Response error');
    });
  });

  describe('NET_ABORT', () => {
    it('应该取消正在进行的请求', async () => {
      // 创建一个挂起的请求
      mockRequest.on.mockImplementation(() => {});

      // 发起请求但不等待
      netHandler['net-request']({
        requestId: 'abort-req-1',
        config: {
          method: 'GET',
          url: 'http://localhost/api',
        },
      });

      // 取消请求
      netHandler['net-abort']({ requestId: 'abort-req-1' });

      expect(mockRequest.abort).toHaveBeenCalled();
    });

    it('取消不存在的请求不应抛出错误', () => {
      expect(() => {
        netHandler['net-abort']({ requestId: 'non-existent' });
      }).not.toThrow();
    });
  });
});
