import {
  BANGUMI_API_BASE_URL,
  BANGUMI_USER_AGENT,
} from '../shared/constants.js';
import { BangumiApiError } from '../shared/errors.js';

const buildUrl = (path, query = {}) => {
  const url = new URL(path, BANGUMI_API_BASE_URL);

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    url.searchParams.set(key, String(value));
  });

  return url.toString();
};

const parseResponseBody = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (!text) {
    return null;
  }

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return {
        title: text,
      };
    }
  }

  return text;
};

export async function requestBangumi(path, options = {}) {
  const {
    token = '',
    method = 'GET',
    query,
    body,
  } = options;

  const headers = {
    Accept: 'application/json',
    'User-Agent': BANGUMI_USER_AGENT,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response;

  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new BangumiApiError('网络连接失败，请检查网络后重试。', {
      cause: error,
    });
  }

  const payload = await parseResponseBody(response);

  if (!response.ok) {
    throw new BangumiApiError(
      payload?.title || payload?.description || payload?.message || 'Bangumi 请求失败。',
      {
        status: response.status,
        payload,
      },
    );
  }

  return payload;
}
