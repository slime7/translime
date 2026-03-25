export class BangumiApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'BangumiApiError';
    this.status = options.status || 0;
    this.code = options.code || 'unknown_error';
    this.payload = options.payload;
  }
}

export const mapBangumiErrorMessage = (error) => {
  if (!error) {
    return '请求失败，请稍后重试。';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof BangumiApiError) {
    switch (error.status) {
    case 0:
      return error.message || '网络连接失败，请检查网络后重试。';
    case 400:
      return '请求参数无效，请检查输入内容。';
    case 401:
      return 'Access Token 无效或已过期，请重新填写。';
    case 403:
      return '当前 Token 没有执行该操作的权限。';
    case 404:
      return 'Bangumi 上没有找到对应数据。';
    case 429:
      return '请求过于频繁，请稍后再试。';
    default:
      return error.message || 'Bangumi 服务暂时不可用，请稍后重试。';
    }
  }

  if (error instanceof Error) {
    return error.message || '请求失败，请稍后重试。';
  }

  return '请求失败，请稍后重试。';
};
