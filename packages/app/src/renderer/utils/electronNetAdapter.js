import axios from 'axios';
import { getUuiD } from '@pkg/share/utils/index';

export default async (config) => {
  // 生成唯一请求 ID，用于后续取消请求
  const requestId = getUuiD();

  // 监听 AbortSignal 并转发到主进程网络层
  if (config.signal) {
    config.signal.addEventListener('abort', () => {
      window.ts.net.abort(requestId);
    });
  }

  // 过滤 undefined/null header，避免 Electron net.request 报错
  const filteredHeaders = config.headers
    ? Object.fromEntries(
      Object.entries(config.headers).filter(([, v]) => v != null),
    )
    : undefined;

  const requestConfig = {
    method: config.method?.toUpperCase() || 'GET',
    url: axios.getUri(config),
    headers: filteredHeaders,
    data: config.data,
  };

  try {
    const response = await window.ts.net.request(requestId, requestConfig);

    // 返回 axios 响应结构
    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: new axios.AxiosHeaders(response.headers),
      config,
      request: {
        // 保留请求元信息用于日志与调试
        _options: requestConfig,
        method: requestConfig.method,
        path: new URL(requestConfig.url).pathname,
        protocol: new URL(requestConfig.url).protocol,
        host: new URL(requestConfig.url).host,
      },
    };
  } catch (err) {
    const axiosError = new axios.AxiosError(
      err.message,
      axios.AxiosError.ERR_NETWORK,
      config,
      {
        _options: requestConfig,
        method: requestConfig.method,
        path: new URL(requestConfig.url).pathname,
        protocol: new URL(requestConfig.url).protocol,
        host: new URL(requestConfig.url).host,
      },
      null,
    );
    axiosError.cause = err;
    throw axiosError;
  }
};
