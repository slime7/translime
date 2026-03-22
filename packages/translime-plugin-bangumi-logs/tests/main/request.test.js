import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import axios from 'axios';
import requestBangumi from '../../src/main/request';
import { BangumiApiError, mapBangumiErrorMessage } from '../../src/shared/errors';

vi.mock('axios');

describe('requestBangumi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应携带 Authorization 与 User-Agent 请求头并使用正确参数调用 axios', async () => {
    axios.mockResolvedValue({
      status: 200,
      data: { username: 'slime' },
    });

    await requestBangumi('/v0/me', {
      token: 'token-1',
    });

    expect(axios).toHaveBeenCalledTimes(1);
    const [config] = axios.mock.calls[0];
    expect(config.headers.Authorization).toBe('Bearer token-1');
    expect(config.headers['User-Agent']).toContain('Translime Bangumi Logs');
    expect(config.url).toBe('/v0/me');
    expect(config.baseURL).toContain('api.bgm.tv');
  });

  it('请求失败时应抛出 BangumiApiError', async () => {
    axios.mockRejectedValue({
      response: {
        status: 401,
        data: { title: 'unauthorized' },
      },
    });

    await expect(requestBangumi('/v0/me', {
      token: 'bad-token',
    })).rejects.toThrow(BangumiApiError);
  });

  it('应将 401 错误映射为中文提示', () => {
    const message = mapBangumiErrorMessage(new BangumiApiError('unauthorized', {
      status: 401,
    }));

    expect(message).toBe('Access Token 无效或已过期，请重新填写。');
  });
});
