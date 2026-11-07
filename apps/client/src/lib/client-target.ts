import { Capacitor } from '@capacitor/core';

export const isStandaloneClient = Capacitor.isNativePlatform() || import.meta.env.VITE_CLIENT_TARGET === 'desktop';

export function clientDeviceType(): 'browser' | 'mobile' | 'desktop' {
  if (Capacitor.isNativePlatform()) {
    return 'mobile';
  }

  return import.meta.env.VITE_CLIENT_TARGET === 'desktop' ? 'desktop' : 'browser';
}
