import type { DeviceType } from '@/shared';
import { clientDeviceType } from './client-target';

const SESSION_KEY = 'melody-manager-session-id';

// Per tab, and stable across reloads of that tab, so a reloaded client still
// recognises its own presence row instead of mistaking it for another device.
export function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) {
      return existing;
    }

    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return 'ephemeral';
  }
}

// Every build runs the same client, but they are different devices to the
// person choosing where to play.
export function getDeviceType(): DeviceType {
  return clientDeviceType();
}

export function getDeviceLabel(): string {
  // The desktop shell writes the machine name into the document it serves. That
  // is what the person picking a device recognises, so nothing else is needed.
  const host = (globalThis as { __MELODY_HOST__?: string }).__MELODY_HOST__;
  if (host) {
    return host;
  }

  const ua = navigator.userAgent;
  // A shipped client is named after itself. Reading the user agent there names
  // the webview it happens to embed, which on Linux calls itself Safari and
  // means nothing to the person picking a device.
  const browser = clientDeviceType() !== 'browser' ? 'Melody Manager' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}
