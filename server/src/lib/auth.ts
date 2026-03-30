import type { Context, Next } from 'hono';
import PocketBase from 'pocketbase';
import { config } from './config';

async function verifyToken(token: string): Promise<{ id: string; role?: string } | null> {
  const userPb = new PocketBase(config.pb.url);
  userPb.authStore.save(token, null);
  try {
    const { record } = await userPb.collection('users').authRefresh();
    return { id: record.id, role: record.role as string | undefined };
  } catch {
    return null;
  }
}

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
 * Verifies the JWT token against PocketBase and checks the user's role.
 * Returns 401 if not authenticated, 403 if not admin.
 */
export async function adminMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const token = authHeader.slice(7);
  const user = await verifyToken(token);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
}
