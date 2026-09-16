import { useSyncExternalStore } from 'react';
import { getDevices, subscribeDevices } from '@/lib/device-presence';
import { getSessionId } from '@/lib/session-device';
import { type ClientDevice, type Device, isClientDevice, isNetworkDevice, type NetworkDevice } from '@/shared';

export function useDevices() {
  const devices = useSyncExternalStore(subscribeDevices, getDevices);
  const sessionId = getSessionId();
  const clients = devices.filter(isClientDevice);
  const others = clients.filter((d) => d.session !== sessionId);
  const speakers = devices.filter(isNetworkDevice);
  const usableSpeakers = speakers.filter((d) => d.usable);
  const elsewhere: (ClientDevice | NetworkDevice)[] = [...others, ...usableSpeakers];

  return {
    devices,
    speakers,
    usableSpeakers,
    others,
    // Something is playing somewhere else, which is not the same question as
    // where this tab sends its own sound: that one is answered by the device it
    // selected, and only this one when it has selected none.
    playingElsewhere: elsewhere.find((d) => d.playing) ?? elsewhere.find((d) => d.trackId),
  };
}

export type { Device };
