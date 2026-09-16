import { type ClientDevice, type Device, isNetworkDevice, type NetworkDevice } from '@/shared';

/**
 * Which speaker this tab is driving.
 *
 * The one it selected, whatever else may be playing. Taking the first device
 * that answers "playing" instead showed one speaker's name and volume while the
 * transport drove another, which only appears once there are two on the
 * network. A tab that has selected nothing follows whatever is playing
 * elsewhere, so it can still show and stop it, another browser's tab included.
 */
export function remoteTarget(activeDevice: Device | null, devices: Device[], playingElsewhere: ClientDevice | NetworkDevice | undefined): ClientDevice | NetworkDevice | undefined {
  if (activeDevice && isNetworkDevice(activeDevice)) {
    const selected = devices.find((device): device is NetworkDevice => device.id === activeDevice.id && isNetworkDevice(device));
    if (selected) {
      return selected;
    }
  }

  return playingElsewhere;
}
