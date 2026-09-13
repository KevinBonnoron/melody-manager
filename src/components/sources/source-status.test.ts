import type { PluginManifest } from '@/shared';
import { getSourceStatus, isSourceInUse, isUserConnectable } from './source-status';
import { describe, expect, it } from 'bun:test';

const manifest = (over: Partial<PluginManifest>): PluginManifest => ({ id: 'x', name: 'X', scope: 'personal', entry: '', features: [], ...over }) as PluginManifest;

describe('source status', () => {
  const local = manifest({ id: 'local', scope: 'public', unavailable: { stream: ['path'] } });
  const localSet = manifest({ id: 'local', scope: 'public' });
  const spotify = manifest({ id: 'spotify', userConnectable: true, unavailable: { search: ['clientId'] } });
  const youtube = manifest({ id: 'youtube', userConnectable: true });

  it('keeps an unconfigured server source out of the active list', () => {
    expect(getSourceStatus('local', [local], new Set(), false)).toBe('unconfigured');
    expect(isSourceInUse('unconfigured')).toBe(false);
  });

  it('treats a configured server source as in use', () => {
    expect(getSourceStatus('local', [localSet], new Set(), false)).toBe('server');
  });

  it('still counts an unconfigured source that feeds the library', () => {
    expect(getSourceStatus('local', [local], new Set(), true)).toBe('server');
  });

  it('does not offer connecting until the server holds its credentials', () => {
    expect(isUserConnectable('spotify', [spotify])).toBe(false);
    expect(isUserConnectable('youtube', [youtube])).toBe(true);
    expect(isUserConnectable('local', [localSet])).toBe(false);
  });
});
