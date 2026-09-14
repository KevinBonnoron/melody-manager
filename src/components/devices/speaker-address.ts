import type { ConfiguredSpeaker } from '@/hooks/use-speakers';

// IPv4 only, on both sides of the wire: Sonos discovery and control are SSDP and
// UPnP over IPv4, so an address the speaker could not be reached at anyway has
// no business being saved.
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function isSpeakerAddress(value: string): boolean {
  return IPV4.test(value.trim());
}

// What the dialog starts from: the speakers saved, plus the ones answering right
// now that nobody has decided about yet. The same rule the server applies when
// it folds a discovery pass into the list, and for the same reason: an entry
// already decided about keeps exactly the state it was given.
export function withDiscovered(saved: ConfiguredSpeaker[], discovered: string[]): ConfiguredSpeaker[] {
  const known = new Set(saved.map((s) => s.address));
  const extra = discovered.filter((address) => address && !known.has(address)).map((address) => ({ address, enabled: true }));
  return extra.length > 0 ? [...saved, ...extra] : saved;
}
