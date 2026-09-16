import type { DeviceType } from '@/shared';
import { clientDeviceType } from './client-target';

const SESSION_KEY = 'melody-manager-session-id';

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

export function getDeviceType(): DeviceType {
  return clientDeviceType();
}

export function getDeviceLabel(): string {
  const host = (globalThis as { __MELODY_HOST__?: string }).__MELODY_HOST__;
  if (host) {
    return host;
  }

  const ua = navigator.userAgent;
  const browser = clientDeviceType() !== 'browser' ? 'Melody Manager' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}
