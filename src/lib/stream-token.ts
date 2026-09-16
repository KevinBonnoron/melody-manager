import { config } from './config';
import { pb } from './pocketbase';

type CachedToken = { token: string; expiresAt: number; authToken: string };

const RENEW_MARGIN_MS = 60_000;

const cache = new Map<string, CachedToken>();
const inflight = new Map<string, Promise<string>>();

export async function getStreamToken(trackId: string): Promise<string> {
  const authToken = pb.authStore.token;
  const held = cache.get(trackId);
  if (held && held.authToken === authToken && held.expiresAt > Date.now() + RENEW_MARGIN_MS) {
    return held.token;
  }

  const key = `${authToken}\u0000${trackId}`;
  const pending = inflight.get(key);
  if (pending) {
    return pending;
  }

  const request = (async () => {
    const response = await fetch(`${config.server.url}/stream-token?track=${encodeURIComponent(trackId)}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) {
      throw new Error(`stream token request failed: ${response.status}`);
    }
    const { token, expiresIn } = (await response.json()) as { token: string; expiresIn: number };
    cache.set(trackId, { token, expiresAt: Date.now() + expiresIn * 1000, authToken });
    return token;
  })();

  inflight.set(key, request);
  const forget = () => {
    if (inflight.get(key) === request) {
      inflight.delete(key);
    }
  };
  void request.then(forget, forget);
  return request;
}

export function clearStreamToken(): void {
  cache.clear();
  inflight.clear();
}
