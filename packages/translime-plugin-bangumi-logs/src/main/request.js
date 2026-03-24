import axios from 'axios';
import { useLogger } from 'translime-sdk';
import {
  BANGUMI_API_BASE_URL,
  BANGUMI_USER_AGENT,
  PLUGIN_ID,
} from '../shared/constants';
import { BangumiApiError } from '../shared/errors';

const baseLogger = useLogger();
const logger = baseLogger.child ? baseLogger.child({ plugin_id: PLUGIN_ID, context: 'Main' }) : baseLogger;

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

  const reqConfig = {
    method,
    url: path,
    baseURL: BANGUMI_API_BASE_URL,
    params: query,
    data: body,
    headers,
    timeout: 15000,
  };

  try {
    const response = await axios(reqConfig);

    logger.debug('request', {
      data: {
        url: `${reqConfig.baseURL}${reqConfig.url}`,
        method: reqConfig.method.toUpperCase(),
        params: reqConfig.params,
        data: reqConfig.data,
        requestHeaders: reqConfig.headers,
        status: response.status,
        responseHeaders: response.headers,
        responseData: response.data,
      },
    });

    return response.data;
  } catch (error) {
    const errorData = {
      url: `${reqConfig.baseURL}${reqConfig.url}`,
      method: reqConfig.method.toUpperCase(),
      params: reqConfig.params,
      data: reqConfig.data,
      requestHeaders: reqConfig.headers,
      error: error.message,
      isError: true,
    };

    if (error.response) {
      errorData.status = error.response.status;
      errorData.responseHeaders = error.response.headers;
      errorData.responseData = error.response.data;
    }

    logger.debug('request', { data: errorData });

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
