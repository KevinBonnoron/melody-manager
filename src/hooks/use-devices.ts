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
  // Every speaker found, for the screens that configure them, and the ones that
  // may be played to, for everywhere else.
  const usableSpeakers = speakers.filter((d) => d.usable);
  // A speaker plays somewhere else just as much as another browser does, and it
  // outlives the page that started it: after a reload, or a server restart, it
  // is the only thing that still knows sound is coming out.
  const elsewhere: (ClientDevice | NetworkDevice)[] = [...others, ...usableSpeakers];

  return {
    devices,
    speakers,
    usableSpeakers,
    others,
    // A device that paused still holds the track and has to stay on screen, or
    // pausing from elsewhere would remove the very bar used to resume it.
    remoteActive: elsewhere.find((d) => d.playing) ?? elsewhere.find((d) => d.trackId),
  };
}

export type { Device };
