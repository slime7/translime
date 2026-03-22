import { requestBangumi } from '../../src/main/request.js';
import { BangumiApiError, mapBangumiErrorMessage } from '../../src/shared/errors.js';

describe('requestBangumi', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('应携带 Authorization 与 User-Agent 请求头', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify({ username: 'slime' })),
    });

    await requestBangumi('/v0/me', {
      token: 'token-1',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, config] = global.fetch.mock.calls[0];
    expect(config.headers.Authorization).toBe('Bearer token-1');
    expect(config.headers['User-Agent']).toContain('Translime Bangumi Logs');
  });

  it('请求失败时应抛出 BangumiApiError', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify({ title: 'unauthorized' })),
    });

    await expect(requestBangumi('/v0/me', {
      token: 'bad-token',
    })).rejects.toBeInstanceOf(BangumiApiError);
  });

  it('应将 401 错误映射为中文提示', () => {
    const message = mapBangumiErrorMessage(new BangumiApiError('unauthorized', {
      status: 401,
    }));

    expect(message).toBe('Access Token 无效或已过期，请重新填写。');
  });
});
