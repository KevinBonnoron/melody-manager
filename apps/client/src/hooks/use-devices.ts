import { useSyncExternalStore } from 'react';
import { getDevices, subscribeDevices } from '@/lib/device-presence';
import { getSessionId } from '@/lib/session-device';
import { type Device, isClientDevice, isNetworkDevice } from '@/shared';

export function useDevices() {
  const devices = useSyncExternalStore(subscribeDevices, getDevices);
  const sessionId = getSessionId();
  const clients = devices.filter(isClientDevice);
  const others = clients.filter((d) => d.session !== sessionId);
  const speakers = devices.filter(isNetworkDevice);
  const usableSpeakers = speakers.filter((d) => d.usable);

  return { devices, speakers, usableSpeakers, others };
}

export type { Device };
