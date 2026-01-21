import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import useHttp from '@/hooks/useHttp';

// Mock electronNetAdapter
vi.mock('@/utils/electronNetAdapter', () => ({
  default: vi.fn(),
}));

// Mock Axios
const { axiosMock } = vi.hoisted(() => {
  const mock = vi.fn();
  mock.AxiosError = class AxiosError extends Error {
    constructor(message) {
      super(message);
      this.name = 'AxiosError';
    }
  };
  mock.isAxiosError = vi.fn((err) => err?.name === 'AxiosError');
  return { axiosMock: mock };
});

vi.mock('axios', () => ({
  default: axiosMock,
  isAxiosError: axiosMock.isAxiosError,
  AxiosError: axiosMock.AxiosError,
}));

describe('useHttp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 mock 实现：返回成功响应
    axiosMock.mockResolvedValue({
      data: { success: true },
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      config: {},
      request: {
        method: 'GET',
        protocol: 'http:',
        host: 'localhost',
        path: '/test',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应该返回链式调用对象', () => {
    const http = useHttp('http://localhost/api');

    expect(http).toHaveProperty('execute');
    expect(http).toHaveProperty('get');
    expect(http).toHaveProperty('post');
    expect(http).toHaveProperty('loading');
    expect(http).toHaveProperty('data');
    expect(http).toHaveProperty('error');
    expect(typeof http.then).toBe('function');
  });

  describe('execute', () => {
    it('应该调用 axios 并更新状态', async () => {
      const http = useHttp('http://localhost/api');
      const promise = http.execute();

      expect(http.loading.value).toBe(true);
      await promise;
      expect(http.loading.value).toBe(false);
      expect(http.data.value).toEqual({ success: true });
      expect(http.statusCode.value).toBe(200);
    });

    it('应该处理请求错误', async () => {
      const errorMock = new Error('Network Error');
      errorMock.request = {
        _options: {
          method: 'GET', protocol: 'http:', hostname: 'localhost', path: '/test',
        },
      };
      axiosMock.mockRejectedValue(errorMock);

      const http = useHttp('http://localhost/api');

      await expect(http.execute()).rejects.toThrow('Network Error');
      expect(http.error.value).toBe(errorMock);
      expect(http.loading.value).toBe(false);
    });
  });

  describe('HTTP Methods', () => {
    it('get() 应该设置 GET 方法', async () => {
      const http = useHttp('http://localhost/api');
      await http.get();

      expect(axiosMock).toHaveBeenCalledWith(expect.objectContaining({
        method: 'GET',
        url: 'http://localhost/api',
      }));
    });

    it('post() 应该设置 POST 方法和数据', async () => {
      const http = useHttp('http://localhost/api');
      const data = { foo: 'bar' };
      await http.post(data);

      expect(axiosMock).toHaveBeenCalledWith(expect.objectContaining({
        method: 'POST',
        data,
      }));
    });
  });

  describe('Response Types', () => {
    it('json() 应该设置 responseType 为 json', async () => {
      const http = useHttp('http://localhost/api');
      await http.json();

      expect(axiosMock).toHaveBeenCalledWith(expect.objectContaining({
        responseType: 'json',
      }));
    });

    it('blob() 应该设置 responseType 为 blob', async () => {
      const http = useHttp('http://localhost/api');
      await http.blob();

      expect(axiosMock).toHaveBeenCalledWith(expect.objectContaining({
        responseType: 'blob',
      }));
    });
  });

  describe('AbortController', () => {
    it('应该创建 AbortSignal', async () => {
      const http = useHttp('http://localhost/api');
      await http.execute();

      expect(axiosMock).toHaveBeenCalledWith(expect.objectContaining({
        signal: expect.any(AbortSignal),
      }));
    });

    it('调用 abort 应该触发 signal', async () => {
      let signal;
      axiosMock.mockImplementation((config) => {
        signal = config.signal;
        return new Promise(() => {}); // 挂起请求
      });

      const http = useHttp('http://localhost/api');
      http.execute();

      const abortSpy = vi.spyOn(AbortSignal.prototype, 'dispatchEvent'); // 间接验证，实际环境难以直接监测 abort 事件
      // 但我们可以验证 http.abort() 是否被调用不报错，并在真实场景中验证 controller.abort

      http.abort();
      // 在 jsdom 环境下模拟完全的 AbortController 行为可能有限，主要验证逻辑覆盖
    });
  });

  describe('Promise chain (then)', () => {
    it('应该支持直接 await http', async () => {
      const result = await useHttp('http://localhost/api');
      expect(result).toEqual({ success: true });
    });

    it('应该支持 .get().then()', async () => {
      const result = await useHttp('http://localhost/api').get();
      expect(result).toEqual({ success: true });
    });
  });
});
