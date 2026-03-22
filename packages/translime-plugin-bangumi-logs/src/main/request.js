import axios from 'axios';
import {
  BANGUMI_API_BASE_URL,
  BANGUMI_USER_AGENT,
} from '../shared/constants';
import { BangumiApiError } from '../shared/errors';

export default async function requestBangumi(path, options = {}) {
  const {
    token = '',
    method = 'GET',
    query = {},
    body,
  } = options;

  const headers = {
    Accept: 'application/json',
    'User-Agent': BANGUMI_USER_AGENT,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await axios({
      method,
      url: path,
      baseURL: BANGUMI_API_BASE_URL,
      params: query,
      data: body,
      headers,
      timeout: 15000,
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      const payload = error.response.data;
      throw new BangumiApiError(
        payload?.title || payload?.description || payload?.message || 'Bangumi 请求失败。',
        {
          status: error.response.status,
          payload,
        },
      );
    }

    if (error.request) {
      throw new BangumiApiError('网络连接失败，请检查网络后重试。', {
        cause: error,
      });
    }

    throw new BangumiApiError(error.message, {
      cause: error,
    });
  }
}
