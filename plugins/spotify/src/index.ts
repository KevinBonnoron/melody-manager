import type { ImportProvider, PluginImportTrack, PluginStreamDeps, SearchProvider } from '@melody-manager/plugin-sdk';
import type { SearchResult, SearchType, SpotifyTrackProvider, TrackSearchResult } from '@melody-manager/shared';
import { SpotifyClient } from './spotify-client';

function extractTrackId(url: string): string {
  if (url.startsWith('spotify:track:')) return url.replace('spotify:track:', '');
  const match = url.match(/track\/([a-zA-Z0-9]+)/);
  if (match?.[1]) return match[1];
  throw new Error('Invalid Spotify URL or URI');
}

export class SpotifyPlugin implements SearchProvider, ImportProvider {
  private readonly client = new SpotifyClient();

  constructor(_deps: PluginStreamDeps) {}

  async search(query: string, type: SearchType, provider: SpotifyTrackProvider): Promise<SearchResult[]> {
    if (type !== 'track') return [];
    return this.searchTracks(query, provider);
  }

  private async searchTracks(query: string, provider: SpotifyTrackProvider): Promise<TrackSearchResult[]> {
    const { clientId, clientSecret } = provider.config;
    if (!clientId || !clientSecret) {
      console.warn('[Spotify] Search requires clientId and clientSecret configuration');
      return [];
    }
    try {
      await this.client.authenticate(clientId, clientSecret);
      const results = await this.client.search(query, 'track', 20);
      const items = results.tracks?.items ?? [];
      return items.map((track) => ({
        type: 'track' as const,
        provider: 'spotify' as const,
        title: track.name,
        artist: track.artists?.map((a) => a.name).join(', '),
        album: track.album?.name,
        thumbnail: track.album?.images?.[0]?.url,
        externalUrl: track.external_urls?.spotify ?? `spotify:track:${track.id}`,
        duration: track.duration_ms ? Math.floor(track.duration_ms / 1000) : undefined,
      }));
    } catch (error) {
      console.error(`[Spotify] Error searching: ${error}`);
      return [];
    }
  }

  async getTracks(url: string, provider: SpotifyTrackProvider): Promise<PluginImportTrack[]> {
    const { clientId, clientSecret } = provider.config;
    if (!clientId || !clientSecret) {
      throw new Error('[Spotify] clientId and clientSecret required');
    }
    try {
      await this.client.authenticate(clientId, clientSecret);
      const trackId = extractTrackId(url);
      const spotifyTrack = await this.client.getTrack(trackId);

      const artistNames = spotifyTrack.artists?.map((a) => a.name) ?? ['Unknown Artist'];
      const albumName = spotifyTrack.album?.name ?? 'Unknown Album';
      const externalUrl = spotifyTrack.external_urls?.spotify ?? `spotify:track:${trackId}`;

      return [
        {
          title: spotifyTrack.name,
          duration: spotifyTrack.duration_ms ? Math.floor(spotifyTrack.duration_ms / 1000) : 0,
          sourceUrl: externalUrl,
          artistName: artistNames[0] ?? 'Unknown Artist',
          albumName,
          coverUrl: spotifyTrack.album?.images?.[0]?.url,
          metadata: {
            year: spotifyTrack.album?.release_date ? Number.parseInt(spotifyTrack.album.release_date.slice(0, 4), 10) : undefined,
            format: 'spotify',
            spotifyId: trackId,
          },
        },
      ];
    } catch (error) {
      console.error(`[Spotify] Error getting track: ${error}`);
      throw error;
    }
  }
}
