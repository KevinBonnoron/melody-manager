import type { Context, Next } from 'hono';
import { getConnInfo } from 'hono/bun';

const LOCALHOST_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);

/**
 * Middleware that restricts access to internal routes.
 * Only allows requests originating from localhost.
 */
export async function internalMiddleware(c: Context, next: Next) {
  const info = getConnInfo(c);
  if (!info.remote.address || !LOCALHOST_ADDRESSES.has(info.remote.address)) {
    return c.notFound();
  }

  await next();
}
