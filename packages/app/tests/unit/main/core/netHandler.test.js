import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

vi.mock('@pkg/share/utils/ipcConstant', () => ({
  NET_REQUEST: 'net-request',
  NET_ABORT: 'net-abort',
}));

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.mock('electron', () => ({
  net: {
    fetch: mockFetch,
  },
}));

const createHeaders = (headers = {}) => ({
  forEach(callback) {
    Object.entries(headers).forEach(([key, value]) => callback(value, key));
  },
});

const createResponse = ({
  status = 200,
  statusText = 'OK',
  headers = { 'content-type': 'application/json' },
  text = '',
  arrayBuffer = Buffer.from(text),
  textError = null,
  arrayBufferError = null,
} = {}) => ({
  status,
  statusText,
  headers: createHeaders(headers),
  async text() {
    if (textError) {
      throw textError;
    }
    return text;
  },
  async arrayBuffer() {
    if (arrayBufferError) {
      throw arrayBufferError;
    }
    return arrayBuffer;
  },
});

describe('netHandler', () => {
  let netHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockFetch.mockReset();

    const module = await import('@main/core/netHandler');
    netHandler = module.default;
  });

  describe('NET_REQUEST', () => {
    it('应该创建并发送请求', async () => {
      mockFetch.mockResolvedValue(createResponse({
        text: '{"success":true}',
      }));

      const result = await netHandler['net-request']({
        requestId: 'req-1',
        config: {
          method: 'GET',
          url: 'http://localhost/api',
        },
      });

      expect(mockFetch).toHaveBeenCalledWith('http://localhost/api', expect.objectContaining({
        method: 'GET',
      }));
      expect(result).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        data: '{"success":true}',
      });
    });

    it('应该正确设置请求头', async () => {
      mockFetch.mockResolvedValue(createResponse());

      await netHandler['net-request']({
        requestId: 'req-2',
        config: {
          method: 'POST',
          url: 'http://localhost/api',
          headers: { 'Content-Type': 'application/json' },
        },
      });

      expect(mockFetch).toHaveBeenCalledWith('http://localhost/api', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }));
    });

    it('应该写入请求体', async () => {
      mockFetch.mockResolvedValue(createResponse());

      await netHandler['net-request']({
        requestId: 'req-3',
        config: {
          method: 'POST',
          url: 'http://localhost/api',
          data: { foo: 'bar' },
        },
      });

      expect(mockFetch).toHaveBeenCalledWith('http://localhost/api', expect.objectContaining({
        body: '{"foo":"bar"}',
      }));
    });

    it('字符串请求体应直接写入', async () => {
      mockFetch.mockResolvedValue(createResponse());

      await netHandler['net-request']({
        requestId: 'req-4',
        config: {
          method: 'POST',
          url: 'http://localhost/api',
          data: 'raw string data',
        },
      });

      expect(mockFetch).toHaveBeenCalledWith('http://localhost/api', expect.objectContaining({
        body: 'raw string data',
      }));
    });

    it('arrayBuffer 响应类型应返回 base64 编码', async () => {
      mockFetch.mockResolvedValue(createResponse({
        arrayBuffer: Uint8Array.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]).buffer,
      }));

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
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(netHandler['net-request']({
        requestId: 'req-6',
        config: {
          method: 'GET',
          url: 'http://localhost/api',
        },
      })).rejects.toThrow('Network error');
    });

    it('请求被取消应返回 aborted 错误', async () => {
      mockFetch.mockImplementation((_url, options) => new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }));

      const promise = netHandler['net-request']({
        requestId: 'req-7',
        config: {
          method: 'GET',
          url: 'http://localhost/api',
        },
      });

      netHandler['net-abort']({ requestId: 'req-7' });

      await expect(promise).rejects.toThrow('Request was aborted');
    });

    it('响应错误应 reject', async () => {
      mockFetch.mockResolvedValue(createResponse({
        textError: new Error('Response error'),
      }));

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
      let aborted = false;
      mockFetch.mockImplementation((_url, options) => new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => {
          aborted = true;
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }));

      const requestPromise = netHandler['net-request']({
        requestId: 'abort-req-1',
        config: {
          method: 'GET',
          url: 'http://localhost/api',
        },
      });

      netHandler['net-abort']({ requestId: 'abort-req-1' });

      await expect(requestPromise).rejects.toThrow('Request was aborted');
      expect(aborted).toBe(true);
    });

    it('取消不存在的请求不应抛出错误', () => {
      expect(() => {
        netHandler['net-abort']({ requestId: 'non-existent' });
      }).not.toThrow();
    });
  });
});
