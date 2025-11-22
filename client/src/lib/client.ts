import { withDelegate, withInterceptor } from 'universal-client';
import { pb } from './pocketbase';

export const withHttpDelegate = (baseURL: string) =>
  withDelegate(
    { name: 'http', type: 'http', impl: 'fetch', baseURL },
    withInterceptor({
      before: (context) => {
        const token = pb.authStore.token;
        const { 'Content-Type': _, ...restHeaders } = context.headers || {};
        return {
          ...context,
          headers: {
            ...restHeaders,
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        };
      },
    }),
  );

export const withSseDelegate = (baseURL: string) => withDelegate({ name: 'sse', type: 'server-sent-event', impl: 'fetch', baseURL });
