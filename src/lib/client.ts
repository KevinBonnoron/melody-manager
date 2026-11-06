import { HttpError, withDelegate, withInterceptor, withSseDelegate as withServerSentEventDelegate } from 'universal-client';
import { handleRevokedSession } from './auth-session';
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
      onError: (_method, _url, error) => {
        if (error instanceof HttpError && error.status === 401) {
          handleRevokedSession();
        }
      },
    }),
  );

export const withSseDelegate = (baseURL: string) => withServerSentEventDelegate(baseURL, 'sse');

export const sseAuth = () => ({
  method: 'POST' as const,
  headers: { Authorization: `Bearer ${pb.authStore.token}` },
});
