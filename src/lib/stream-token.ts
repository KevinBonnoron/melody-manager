import { config } from './config';
import { pb } from './pocketbase';

type CachedToken = { token: string; expiresAt: number; authToken: string };

const RENEW_MARGIN_MS = 60_000;

let cached: CachedToken | null = null;
let inflight: Promise<string> | null = null;

// An <audio> element sets its src directly and a Sonos speaker fetches the URL
// itself, so neither can send an Authorization header. The API mints a
// short-lived token for the query string instead.
export async function getStreamToken(): Promise<string> {
  const authToken = pb.authStore.token;
  // Keyed on the auth token so signing out or switching user drops the cache.
  if (cached && cached.authToken === authToken && cached.expiresAt > Date.now() + RENEW_MARGIN_MS) {
    return cached.token;
  }

  inflight ??= (async () => {
    try {
      const response = await fetch(`${config.server.url}/stream-token`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!response.ok) {
        throw new Error(`stream token request failed: ${response.status}`);
      }
      const { token, expiresIn } = (await response.json()) as { token: string; expiresIn: number };
      cached = { token, expiresAt: Date.now() + expiresIn * 1000, authToken };
      return token;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function clearStreamToken(): void {
  cached = null;
}
