import { withDelegate, withInterceptor, withSseDelegate as withServerSentEventDelegate } from 'universal-client';
import { pb } from './pocketbase';

export const withHttpDelegate = (baseURL: string) =>
  withDelegate(
    { name: 'http', type: 'http', impl: 'fetch', baseURL },
    withInterceptor({
      onBeforeRequest: (context) => {
        const token = pb.authStore.token;
        const headers = { ...(context.headers || {}) };
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
        return {
          ...context,
          headers: {
            ...headers,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        };
      },
    }),
  );

export const withSseDelegate = (baseURL: string) => withServerSentEventDelegate(baseURL, 'sse');
