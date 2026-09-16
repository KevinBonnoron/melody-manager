import type { ClientDevice, NetworkDevice } from '@/shared';
import { remoteTarget } from './remote-target';
import { describe, expect, it } from 'bun:test';

const speaker = (id: string, over: Partial<NetworkDevice> = {}) => ({ id, name: id, type: 'sonos', ipAddress: '192.168.0.1', isActive: true, usable: true, playing: false, ...over }) as NetworkDevice;
const tab = (id: string, over: Partial<ClientDevice> = {}) => ({ id, name: id, type: 'browser', session: id, playing: false, ...over }) as ClientDevice;

describe('remoteTarget', () => {
  it('is the speaker this tab selected, whatever else is playing', () => {
    const chromecast = speaker('bureau', { type: 'chromecast' });
    const sonos = speaker('salle-tv', { playing: true });

    expect(remoteTarget(chromecast, [sonos, chromecast], sonos)?.id).toBe('bureau');
  });

  it('reads that speaker as the device list has it, not as it was selected', () => {
    const selected = speaker('bureau', { volume: 10 });
    const fresh = speaker('bureau', { volume: 55, playing: true });

    expect(remoteTarget(selected, [fresh], undefined)?.volume).toBe(55);
  });

  it('follows whatever plays elsewhere when this tab has selected nothing', () => {
    const sonos = speaker('salle-tv', { playing: true });

    expect(remoteTarget(null, [sonos], sonos)?.id).toBe('salle-tv');
  });

  it('follows another browser tab the same way', () => {
    const other = tab('another-session', { playing: true });

    expect(remoteTarget(null, [other], other)?.id).toBe('another-session');
  });

  it('falls back while a selected speaker is missing from the list', () => {
    const gone = speaker('unplugged');
    const sonos = speaker('salle-tv', { playing: true });

    expect(remoteTarget(gone, [sonos], sonos)?.id).toBe('salle-tv');
  });

  it('is nothing at all when this tab plays here and nothing plays elsewhere', () => {
    expect(remoteTarget(null, [speaker('salle-tv')], undefined)).toBeUndefined();
  });
});
