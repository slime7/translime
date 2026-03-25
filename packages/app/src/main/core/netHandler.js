import { net } from 'electron';
import * as ipcType from '@pkg/share/utils/ipcConstant';

const activeRequests = new Map();
export default {
  /**
   * 处理网络请求
   * @param {object} param0 - 请求参数
   * @param {string} param0.requestId - 请求唯一标识
   * @param {object} param0.config - 请求配置
   * @returns {Promise<object>} 响应对象
   */
  async [ipcType.NET_REQUEST]({ requestId, config }) {
    try {
      const controller = new AbortController();

      // 将请求存入 Map，以便后续取消
      activeRequests.set(requestId, controller);

      const fetchOptions = {
        method: config.method || 'GET',
        signal: controller.signal,
      };

      if (config.headers) {
        fetchOptions.headers = config.headers;
      }

      const methodUpper = fetchOptions.method.toUpperCase();
      // 写入请求体，GET/HEAD 请求不能包含 body
      if (config.data && methodUpper !== 'GET' && methodUpper !== 'HEAD') {
        fetchOptions.body = typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
      }

      const response = await net.fetch(config.url, fetchOptions);

      let data;
      if (config?.responseType === 'arrayBuffer') {
        const arrayBuffer = await response.arrayBuffer();
        // 如果是二进制需转 base64
        data = Buffer.from(arrayBuffer).toString('base64');
      } else {
        // 简单处理
        data = await response.text();
      }

      // 请求完成，移除 Map 记录
      activeRequests.delete(requestId);

      const responseHeaders = {};
      if (response.headers && typeof response.headers.forEach === 'function') {
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });
      } else if (response.headers) {
        Object.assign(responseHeaders, response.headers);
      }

      // 返回响应数据
      return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        data,
      };
    } catch (error) {
      activeRequests.delete(requestId);
      // 区分取消和真正的错误
      if (error && error.name === 'AbortError') {
        throw new Error('Request was aborted');
      }
      throw error;
    }
  },
  [ipcType.NET_ABORT]({ requestId }) {
    const controller = activeRequests.get(requestId);
    if (controller) {
      controller.abort();
      activeRequests.delete(requestId);
    }
  },
};
