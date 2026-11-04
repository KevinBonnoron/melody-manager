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

export function getDeviceLabel(userAgent?: string): string {
  const host = userAgent === undefined && (globalThis as { __MELODY_HOST__?: string }).__MELODY_HOST__;
  if (host) {
    return host;
  }

  const ua = userAgent ?? navigator.userAgent;
  const browser = userAgent === undefined && clientDeviceType() !== 'browser' ? 'Melody Manager' : /Edg\/|EdgiOS\/|EdgA\//.test(ua) ? 'Edge' : /OPR\/|OPiOS\//.test(ua) ? 'Opera' : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return browser && os ? `${browser} · ${os}` : browser || os;
}
