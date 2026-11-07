import type { ConfiguredSpeaker } from '@/hooks/use-speakers';

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function isSpeakerAddress(value: string): boolean {
  return IPV4.test(value.trim());
}

export function withDiscovered(saved: ConfiguredSpeaker[], discovered: string[]): ConfiguredSpeaker[] {
  const known = new Set(saved.map((s) => s.address));
  const extra = discovered.filter((address) => address && !known.has(address)).map((address) => ({ address, enabled: true }));
  return extra.length > 0 ? [...saved, ...extra] : saved;
}
