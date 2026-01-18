import axios from 'axios';
import { getUuiD } from '@pkg/share/utils/index';

export default async (config) => {
  // 1. 生成唯一的 Request ID
  const requestId = getUuiD();

  // 2. 处理 CancelToken / AbortSignal
  // 现代 Axios 推荐使用 signal (AbortController)
  if (config.signal) {
    config.signal.addEventListener('abort', () => {
      window.ts.net.abort(requestId);
    });
  }

  // 3. 构建通过 IPC 发送的 Config 对象
  // 注意：不能直接传 config，因为它包含不可序列化的对象（如 validateStatus 函数）
  // 过滤掉 headers 中值为 undefined/null 的键，Electron net.request 不接受这类值
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
    // 4. 调用 IPC
    const response = await window.ts.net.request(requestId, requestConfig);

    // 5. 构建兼容 axios 的响应结构
    // @see https://axios-http.com/docs/res_schema
    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: new axios.AxiosHeaders(response.headers),
      config,
      request: {
        // 模拟 XMLHttpRequest 的部分属性，用于日志和调试
        _options: requestConfig,
        method: requestConfig.method,
        path: new URL(requestConfig.url).pathname,
        protocol: new URL(requestConfig.url).protocol,
        host: new URL(requestConfig.url).host,
      },
    };
  } catch (err) {
    // AxiosError(message, code, config, request, response)
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
      }, // request 对象
      null, // response 对象（网络错误通常没有响应）
    );
    // 保留原始错误信息
    axiosError.cause = err;
    throw axiosError;
  }
};
