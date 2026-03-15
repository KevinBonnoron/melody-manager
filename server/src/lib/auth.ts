import type { Context, Next } from 'hono';

/**
 * Middleware that extracts the user ID from the PocketBase JWT token.
 * Sets `userId` on the context variable, or null if not authenticated.
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      c.set('userId', payload.id as string);
    } catch {
      c.set('userId', null);
    }
  } else {
    c.set('userId', null);
  }
  await next();
}

/**
 * Middleware that restricts access to admin users only.
 * Must be used after authMiddleware.
 * Returns 401 if not authenticated, 403 if not admin.
 */
export async function adminMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  try {
    const token = authHeader.slice(7);
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.role !== 'admin') {
      return c.json({ error: 'Forbidden' }, 403);
    }
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
}
