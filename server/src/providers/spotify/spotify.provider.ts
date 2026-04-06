import type { ResolvedTrack, SearchResult, SearchType, TrackProvider, TrackSearchResult } from '@melody-manager/shared';
import { ProviderAuthError } from '../../utils';
import type { SearchProvider } from '../types';
import { SpotifyClient } from './spotify.client';

function extractTrackId(url: string): string {
  if (url.startsWith('spotify:track:')) {
    return url.replace('spotify:track:', '');
  }

  const match = url.match(/track\/([a-zA-Z0-9]+)/);
  if (match?.[1]) {
    return match[1];
  }

  throw new Error('Invalid Spotify URL or URI');
}

export class SpotifyProvider implements SearchProvider {
  private readonly client = new SpotifyClient();

  public async search(query: string, type: SearchType, provider: TrackProvider): Promise<SearchResult[]> {
    if (type !== 'track') {
      return [];
    }

    return this.searchTracks(query, provider);
  }

  private async searchTracks(query: string, provider: TrackProvider): Promise<TrackSearchResult[]> {
    const clientId = provider.config.clientId as string | undefined;
    const clientSecret = provider.config.clientSecret as string | undefined;
    if (!clientId || !clientSecret) {
      throw new ProviderAuthError('CREDENTIALS_REQUIRED', 'spotify', 'Spotify requires clientId and clientSecret');
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
        coverUrl: track.album?.images?.[0]?.url,
        sourceUrl: track.external_urls?.spotify ?? `spotify:track:${track.id}`,
        duration: track.duration_ms ? Math.floor(track.duration_ms / 1000) : undefined,
      }));
    } catch (error) {
      console.error(`[Spotify] Error searching: ${error}`);
      return [];
    }
  }

  public async resolveTracks(url: string, provider: TrackProvider): Promise<ResolvedTrack[]> {
    const clientId = provider.config.clientId as string | undefined;
    const clientSecret = provider.config.clientSecret as string | undefined;
    if (!clientId || !clientSecret) {
      throw new ProviderAuthError('CREDENTIALS_REQUIRED', 'spotify', 'Spotify requires clientId and clientSecret');
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
            coverArtUrl: spotifyTrack.album?.images?.[0]?.url,
            isrc: spotifyTrack.external_ids?.isrc,
            releaseDate: spotifyTrack.album?.release_date,
          },
        },
      ];
    } catch (error) {
      console.error(`[Spotify] Error getting track: ${error}`);
      throw error;
    }
  }
}
