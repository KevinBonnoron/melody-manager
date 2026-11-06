import { getTokenPayload } from 'pocketbase';
import { pb } from '@/lib/pocketbase';

export function currentSessionID(): string {
  const sid = getTokenPayload(pb.authStore.token).sid;
  return typeof sid === 'string' ? sid : '';
}

export async function revokeSession(id: string): Promise<void> {
  await pb.send(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function signOutSession(): Promise<void> {
  await pb.send('/api/sessions/current', {
    method: 'DELETE',
    requestKey: null,
    signal: AbortSignal.timeout(5000),
  });
}

export function handleRevokedSession() {
  if (!pb.authStore.token) {
    return;
  }
  pb.authStore.clear();
  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
}

// Native PocketBase calls and universal-client calls use different transports.
// This hook covers the former; withHttpDelegate covers the latter.
export function installSessionRevocation() {
  pb.afterSend = (response, data) => {
    if (response.status === 401) {
      handleRevokedSession();
    }
    return data;
  };
}
