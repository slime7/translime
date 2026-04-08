function createRequestId() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `ts-net-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createRequestMeta(requestConfig) {
  const url = new URL(requestConfig.url);
  return {
    _options: requestConfig,
    method: requestConfig.method,
    path: url.pathname,
    protocol: url.protocol,
    host: url.host,
    hostname: url.hostname,
  };
}

function createNetworkError(message, config, requestConfig, cause) {
  const error = new Error(message || 'Network Error');
  error.code = 'ERR_NETWORK';
  error.config = config;
  error.request = createRequestMeta(requestConfig);
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function normalizeHeaders(headers) {
  if (!headers) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(headers).filter(([, value]) => value != null),
  );
}

function appendParam(searchParams, key, value) {
  if (value == null) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => {
      appendParam(searchParams, key, item);
    });
    return;
  }

  if (value instanceof Date) {
    searchParams.append(key, value.toISOString());
    return;
  }

  if (typeof value === 'object') {
    searchParams.append(key, JSON.stringify(value));
    return;
  }

  searchParams.append(key, String(value));
}

function appendParams(url, params) {
  if (!params || typeof params !== 'object') {
    return url;
  }

  const targetUrl = new URL(url);
  Object.entries(params).forEach(([key, value]) => {
    appendParam(targetUrl.searchParams, key, value);
  });

  return targetUrl.toString();
}

function buildRequestConfig(config) {
  const baseURL = config.baseURL ? config.baseURL.replace(/\/+$/, '') : '';
  const rawUrl = new URL(config.url, baseURL || undefined).toString();
  const url = appendParams(rawUrl, config.params);

  return {
    method: config.method?.toUpperCase() || 'GET',
    url,
    headers: normalizeHeaders(config.headers),
    data: config.data,
    responseType: config.responseType,
  };
}

function buildPreviewOptions(requestConfig) {
  return {
    method: requestConfig.method,
    headers: requestConfig.headers,
    body: requestConfig.data,
  };
}

export default async function electronNetAdapter(config) {
  const net = typeof window !== 'undefined' ? window.ts?.net : null;
  if (!net?.request) {
    throw createNetworkError('window.ts.net.request is not available', config, {
      method: config.method?.toUpperCase() || 'GET',
      url: new URL(config.url, config.baseURL || undefined).toString(),
    });
  }

  const requestId = createRequestId();
  const requestConfig = buildRequestConfig(config);
  const requestMeta = createRequestMeta(requestConfig);

  if (config.signal && typeof net.abort === 'function') {
    config.signal.addEventListener('abort', () => {
      net.abort(requestId);
    }, { once: true });
  }

  try {
    let response;
    try {
      response = await net.request(requestId, requestConfig);
    } catch (error) {
      response = await net.request(
        requestConfig.url,
        buildPreviewOptions(requestConfig),
      );
      if (response?.ok === false && !response.status) {
        throw error;
      }
    }

    return {
      data: response?.data,
      status: response?.status,
      statusText: response?.statusText || '',
      headers: response?.headers || {},
      config,
      request: requestMeta,
    };
  } catch (error) {
    throw createNetworkError(error.message, config, requestConfig, error);
  }
}
