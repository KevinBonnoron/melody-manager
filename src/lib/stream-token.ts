import { config } from './config';
import { pb } from './pocketbase';

type CachedToken = { token: string; expiresAt: number; authToken: string };

const RENEW_MARGIN_MS = 60_000;

// Keyed by track, because a token now opens one track and nothing else. A
// listener switching between two of them keeps both until they expire. The
// requests in flight are keyed by listener as well: see below.
const cache = new Map<string, CachedToken>();
const inflight = new Map<string, Promise<string>>();

// An <audio> element sets its src directly and a Sonos speaker fetches the URL
// itself, so neither can send an Authorization header. The API mints a
// short-lived permission for the query string instead: one listener, one track,
// and nothing else. It used to be an ordinary session token, which made every
// stream URL worth as much as a password.
export async function getStreamToken(trackId: string): Promise<string> {
  const authToken = pb.authStore.token;
  const held = cache.get(trackId);
  // Keyed on the auth token too, so signing out or switching user drops it.
  if (held && held.authToken === authToken && held.expiresAt > Date.now() + RENEW_MARGIN_MS) {
    return held.token;
  }

  // Keyed on the auth token as well, like the cache above. Signing out does not
  // reach in here, so a request started as one listener would otherwise be
  // handed to whoever signs in next and asks for the same track, along with the
  // identity minted into it.
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
  // Only its own entry: a request that settles after the map was cleared and a
  // newer one took its place would otherwise remove the newer one, leaving the
  // next caller to fetch a token that is already on its way.
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
