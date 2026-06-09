import { Capacitor, CapacitorHttp } from '@capacitor/core';

const buildHeaderMap = (headersLike = {}) => {
  const headers = new Headers(headersLike);
  return Object.fromEntries(headers.entries());
};

const createResponseLike = (nativeResponse) => {
  const headerEntries = Object.entries(nativeResponse?.headers || {}).reduce((acc, [key, value]) => {
    acc[key.toLowerCase()] = value;
    return acc;
  }, {});

  const readJson = async () => {
    if (typeof nativeResponse?.data === 'string') {
      return nativeResponse.data ? JSON.parse(nativeResponse.data) : null;
    }
    return nativeResponse?.data ?? null;
  };

  return {
    ok: nativeResponse.status >= 200 && nativeResponse.status < 300,
    status: nativeResponse.status,
    headers: {
      get(name) {
        return headerEntries[String(name || '').toLowerCase()] ?? null;
      },
    },
    json: readJson,
    text: async () => {
      if (typeof nativeResponse?.data === 'string') {
        return nativeResponse.data;
      }
      return JSON.stringify(nativeResponse?.data ?? null);
    },
  };
};

export const nativeAwareFetch = async (url, options = {}) => {
  const isNative = typeof Capacitor?.isNativePlatform === 'function' && Capacitor.isNativePlatform();
  const body = options.body;

  if (
    !isNative ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer
  ) {
    return fetch(url, options);
  }

  const headers = buildHeaderMap(options.headers);
  const contentType = headers['content-type'] || headers['Content-Type'];
  let data;

  if (typeof body === 'string') {
    if (contentType?.includes('application/json')) {
      data = body ? JSON.parse(body) : undefined;
    } else {
      data = body;
    }
  } else if (body != null) {
    data = body;
  }

  const nativeResponse = await CapacitorHttp.request({
    url,
    method: String(options.method || 'GET').toUpperCase(),
    headers,
    data,
    responseType: 'text',
  });

  return createResponseLike(nativeResponse);
};
