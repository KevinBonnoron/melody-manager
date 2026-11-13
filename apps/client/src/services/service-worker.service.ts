import { isStandaloneClient } from '@/lib/client-target';

/**
 * forgetServiceWorker takes the offline cache out of the app shells. They carry
 * their own copy of the client, in the APK or the desktop binary, and a service
 * worker in front of it kept answering with the build it had cached: an updated
 * app opened on the version it was replacing. Shells that registered one before
 * it was left out have it removed here, along with what it had stored.
 */
export async function forgetServiceWorker() {
  if (!isStandaloneClient || !('serviceWorker' in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  }
}
