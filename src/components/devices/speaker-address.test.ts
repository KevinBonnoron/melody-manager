import { isSpeakerAddress, withDiscovered } from './speaker-address';
import { describe, expect, it } from 'bun:test';

describe('isSpeakerAddress', () => {
  it('accepts an IPv4 address, spaces around it included', () => {
    expect(isSpeakerAddress('192.168.10.119')).toBe(true);
    expect(isSpeakerAddress('  10.0.0.1  ')).toBe(true);
    expect(isSpeakerAddress('0.0.0.0')).toBe(true);
  });

  it('rejects anything that is not one', () => {
    expect(isSpeakerAddress('ertgdfg')).toBe(false);
    expect(isSpeakerAddress('')).toBe(false);
    expect(isSpeakerAddress('192.168.10')).toBe(false);
    expect(isSpeakerAddress('192.168.10.119.4')).toBe(false);
    expect(isSpeakerAddress('192.168.10.256')).toBe(false);
    expect(isSpeakerAddress('192.168.10.01')).toBe(false);
    expect(isSpeakerAddress('fe80::1')).toBe(false);
    expect(isSpeakerAddress('192.168.10.119:1400')).toBe(false);
  });
});

describe('withDiscovered', () => {
  it('offers what is answering and nobody has decided about', () => {
    expect(withDiscovered([], ['192.168.10.119'])).toEqual([{ address: '192.168.10.119', enabled: true }]);
  });

  it('leaves a speaker already decided about exactly as it was', () => {
    const saved = [{ address: '192.168.10.119', enabled: false }];
    expect(withDiscovered(saved, ['192.168.10.119'])).toEqual(saved);
  });

  it('returns the saved list itself when discovery adds nothing', () => {
    const saved = [{ address: '192.168.10.119', enabled: true }];
    expect(withDiscovered(saved, [])).toBe(saved);
  });
});
