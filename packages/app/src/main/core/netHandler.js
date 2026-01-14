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
  [ipcType.NET_REQUEST]({ requestId, config }) {
    return new Promise((resolve, reject) => {
      try {
        const request = net.request({
          method: config.method,
          url: config.url,
          ...config.headers && { headers: config.headers },
        });

        // 将请求存入 Map，以便后续取消
        activeRequests.set(requestId, request);

        request.on('response', (response) => {
          // 收集响应数据
          const chunks = [];

          response.on('data', (chunk) => {
            chunks.push(chunk);
          });

          response.on('end', () => {
            // 请求完成，移除 Map 记录
            activeRequests.delete(requestId);

            const data = Buffer.concat(chunks);
            // 返回响应数据
            const result = {
              status: response.statusCode,
              statusText: response.statusMessage,
              headers: response.headers,
              data: data.toString('utf-8'), // 简单处理，如果是二进制需转 base64
            };
            if (config?.responseType === 'arrayBuffer') {
              result.data = data.toString('base64');
            }
            resolve(result);
          });

          response.on('error', (error) => {
            activeRequests.delete(requestId);
            reject(error);
          });
        });

        request.on('error', (error) => {
          activeRequests.delete(requestId);
          // 区分取消和真正的错误
          if (error.message === 'aborted') {
            reject(new Error('Request was aborted'));
          } else {
            reject(error);
          }
        });

        // 写入请求体
        if (config.data) {
          request.write(typeof config.data === 'string' ? config.data : JSON.stringify(config.data));
        }

        request.end();
      } catch (error) {
        activeRequests.delete(requestId);
        reject(error);
      }
    });
  },
  [ipcType.NET_ABORT]({ requestId }) {
    const request = activeRequests.get(requestId);
    if (request) {
      request.abort();
      activeRequests.delete(requestId);
    }
  },
};
