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

// The SSE delegate only falls back to EventSource — which cannot set headers —
// for GET. Opening with POST puts it on fetch, so the stream carries the same
// bearer token as every other request.
export const sseAuth = () => ({
  method: 'POST' as const,
  headers: { Authorization: `Bearer ${pb.authStore.token}` },
});
