import {
  computed, isRef, readonly, shallowRef,
} from 'vue';
import axios from 'axios';
import electronNetAdapter from '@/utils/electronNetAdapter';

/**
 * @typedef {Object} HttpChainable
 * @property {Readonly<Ref<boolean>>} loading - 请求加载状态
 * @property {Object} response - 原始响应对象
 * @property {Object} error - 错误对象
 * @property {number|undefined} statusCode - 状态码
 * @property {string} statusText - 状态文本
 * @property {Object} data - 响应数据
 * @property {Object} headers - 响应头
 * @property {Object} requestConfig - 请求配置
 * @property {Function} execute - 执行请求的方法
 * @property {Function} get - GET 方法
 * @property {Function} post - POST 方法
 * @property {Function} put - PUT 方法
 * @property {Function} patch - PATCH 方法
 * @property {Function} delete - DELETE 方法
 * @property {Function} head - HEAD 方法
 * @property {Function} options - OPTIONS 方法
 * @property {Function} postForm - POST 表单方法
 * @property {Function} json - 设置响应类型为 JSON
 * @property {Function} text - 设置响应类型为文本
 * @property {Function} blob - 设置响应类型为 Blob
 * @property {Function} then - Promise then 方法
 * @property {Function} catch - Promise catch 方法
 * @property {Function} finally - Promise finally 方法
 */

/**
 * HTTP 请求函数
 * @param {any} url - 请求 URL
 * @param {Object} [axiosConfig={}] - Axios 配置
 * @returns {HttpChainable} 可链式调用的 HTTP 请求对象
 */
export default (url, axiosConfig = {}) => {
  let internalAxiosConfig = {
    method: 'GET',
    adapter: [electronNetAdapter, 'fetch'],
    ...axiosConfig,
  };
  let requestCounter = 0;

  const loading = shallowRef(false);
  const response = shallowRef(null);
  const responseError = shallowRef(null);
  const responseData = shallowRef(null);
  const responseHeaders = shallowRef({});
  const requestConfig = shallowRef({});

  let controller;
  const createAbortSignal = () => {
    controller = new AbortController();
    internalAxiosConfig = {
      ...internalAxiosConfig,
      signal: controller.signal,
    };
  };
  const abort = (reason = null) => {
    if (loading.value) {
      controller?.abort(reason);
    }
  };

  const http = async () => {
    abort();
    createAbortSignal();
    loading.value = true;

    requestCounter += 1;
    const currentCounter = requestCounter;

    response.value = null;
    responseError.value = null;
    responseData.value = null;
    responseHeaders.value = null;
    requestConfig.value = null;

    const finalConfig = {
      ...internalAxiosConfig,
      headers: {
        ...(axiosConfig.headers || {}),
      },
    };
    const finalUrl = isRef(url) ? url.value : url;
    if (finalUrl) {
      finalConfig.url = finalUrl;
    }

    try {
      const httpResponse = await axios(finalConfig);
      response.value = httpResponse;
      responseData.value = httpResponse.data;
      responseHeaders.value = httpResponse.headers;
      requestConfig.value = httpResponse.config;
      return httpResponse;
    } catch (err) {
      if (err.response) {
        const httpResponse = err.response;
        response.value = httpResponse;
        responseData.value = httpResponse.data;
        responseHeaders.value = httpResponse.headers;
        requestConfig.value = httpResponse.config;
      }
      responseError.value = err;
      throw err;
    } finally {
      if (currentCounter === requestCounter) {
        loading.value = false;
      }
      console.log(response.value, responseError.value);
      /* eslint-disable no-console,no-underscore-dangle */
      const request = response.value?.request || responseError.value?.request._options;
      const isError = !response.value;
      console.groupCollapsed(
        `%c ${request.method} ${request.protocol} ${isError ? request.hostname : request.host}${request.path} `,
        'background: rgb(70, 70, 70); color: rgb(240, 235, 200); width:100%;',
      );
      console.log('Time: ', new Date());
      console.log('Method: ', request?.method || finalConfig.method);
      console.log('Status: ', response.value?.status || undefined);
      console.log('Host: ', `${request.protocol}${isError ? request.hostname : request.host}`);
      console.log('Path: ', request.path);
      console.log('Params: ', finalConfig.params);
      console.log('Data: ', finalConfig.data);
      console.log('Request Headers: ');
      console.log(request._header || request.headers);
      console.log('Response Headers: ', response.value?.headers);
      console.log('Response data: ', responseData.value);
      console.groupEnd();
      /* eslint-enable no-console,no-underscore-dangle */
    }
  };

  const returnResult = {
    loading: readonly(loading),
    abort,
    response,
    error: responseError,
    statusCode: computed(() => response.value?.status || undefined),
    statusText: computed(() => response.value?.statusText || ''),
    data: responseData,
    headers: responseHeaders,
    requestConfig,
    execute: http,
    /* eslint-disable no-use-before-define */
    // method
    get: httpMethod('GET'),
    post: httpMethod('POST'),
    put: httpMethod('PUT'),
    patch: httpMethod('PATCH'),
    delete: httpMethod('DELETE'),
    head: httpMethod('HEAD'),
    options: httpMethod('OPTIONS'),
    postForm: httpMethod('POST', 'form'),
    // response type
    json: httpResponseType('json'),
    text: httpResponseType('text'),
    blob: httpResponseType('blob'),
    /* eslint-enable no-use-before-define */
  };

  function httpPromise() {
    return new Promise((resolve, reject) => {
      http().then(() => resolve(responseData.value)).catch(reject);
    });
  }

  function httpMethod(method, type = 'json') {
    return (data) => {
      internalAxiosConfig.method = method;
      if (type === 'form') {
        internalAxiosConfig.headers = {
          ...(internalAxiosConfig.headers || {}),
          'content-type': 'application/x-www-form-urlencoded',
        };
      }
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && data) {
        internalAxiosConfig.data = data;
      }
      return {
        ...returnResult,
        then(onFulfilled, onRejected) {
          return httpPromise().then(onFulfilled, onRejected);
        },
      };
    };
  }

  function httpResponseType(type = 'json') {
    return () => {
      internalAxiosConfig.responseType = type;
      return {
        ...returnResult,
        then(onFulfilled, onRejected) {
          return httpPromise().then(onFulfilled, onRejected);
        },
      };
    };
  }

  return {
    ...returnResult,
    then(onFulfilled, onRejected) {
      return httpPromise().then(onFulfilled, onRejected);
    },
  };
};
