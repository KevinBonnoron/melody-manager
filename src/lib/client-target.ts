import { Capacitor } from '@capacitor/core';

// A client that ships on its own has no server behind the page it was served
// from, so it has to be told where Melody Manager lives before it can do
// anything. Android knows it from the platform; a desktop window has no
// platform to ask, so the desktop bundle says so at build time.
export const isStandaloneClient = Capacitor.isNativePlatform() || import.meta.env.VITE_CLIENT_TARGET === 'desktop';

// What this client calls itself in the device list.
export function clientDeviceType(): 'browser' | 'mobile' | 'desktop' {
  if (Capacitor.isNativePlatform()) {
    return 'mobile';
  }

  return import.meta.env.VITE_CLIENT_TARGET === 'desktop' ? 'desktop' : 'browser';
}
