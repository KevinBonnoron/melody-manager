import type { Album, SpotifyTrackProvider, Track, TrackMetadata, TrackSearchResult } from '@melody-manager/shared';
import { spotifyMetadataSource } from '../metadata-sources';
import { albumRepository, artistRepository, genreRepository, trackRepository } from '../repositories';
import { metadataSourceService, spotifyService } from '../services';
import type { TrackSource } from '../types';
import { logger } from '../lib/logger';

class SpotifySource implements TrackSource<SpotifyTrackProvider> {
  /**
   * Search Spotify by query
   * @param query - Search query string
   * @param provider - Spotify track provider configuration
   * @returns Array of track search results
   */
  async searchTracks(query: string, provider: SpotifyTrackProvider): Promise<TrackSearchResult[]> {
    const { clientId, clientSecret } = provider.config;

    if (!clientId || !clientSecret) {
      logger.warn('[Spotify] Search requires clientId and clientSecret configuration');
      return [];
    }

    try {
      await spotifyService.authenticate(clientId, clientSecret);
      const results = await spotifyService.search(query, 'track', 20);

      return (
        results.tracks?.items.map((track: any) => ({
          type: 'track' as const,
          provider: 'spotify',
          title: track.name,
          artist: track.artists?.map((a: any) => a.name).join(', '),
          album: track.album?.name,
          thumbnail: track.album?.images?.[0]?.url,
          externalUrl: track.external_urls?.spotify || `spotify:track:${track.id}`,
          duration: track.duration_ms ? Math.floor(track.duration_ms / 1000) : undefined,
        })) || []
      );
    } catch (error) {
      logger.error(`[Spotify] Error searching: ${error}`);
      return [];
    }
  }

  /**
   * Get or create track from Spotify URL/URI
   * @param url - Spotify track URL or URI
   * @param provider - Spotify track provider configuration
   * @returns Array with single track
   */
  async getTracks(url: string, provider: SpotifyTrackProvider): Promise<Track[]> {
    const { clientId, clientSecret } = provider.config;

    if (!clientId || !clientSecret) {
      throw new Error('[Spotify] clientId and clientSecret required');
    }

    try {
      await spotifyService.authenticate(clientId, clientSecret);
      const trackId = this.extractTrackId(url);
      const spotifyTrack = await spotifyService.getTrack(trackId);

      const artistNames = spotifyTrack.artists?.map((a: any) => a.name) || ['Unknown Artist'];
      const artistIds = await Promise.all(
        artistNames.map(async (artistName: string) => {
          const { id } = await artistRepository.getOrCreate({ name: artistName }, `name = "${artistName}"`);
          return id;
        }),
      );

      const albumName = spotifyTrack.album?.name || 'Unknown Album';
      const albumData: Partial<Album> = {
        name: albumName,
        artists: artistIds,
        coverUrl: spotifyTrack.album?.images?.[0]?.url,
      };

      const album = await albumRepository.getOrCreate(albumData, `name = "${albumName}"`);

      const externalUrl = spotifyTrack.external_urls?.spotify || `spotify:track:${trackId}`;
      const enrichedMetadata = await metadataSourceService.getMetadataWithSources(
        {
          sourceUrl: externalUrl,
          title: spotifyTrack.name,
          artist: artistNames[0],
          album: albumName,
          duration: spotifyTrack.duration_ms ? Math.floor(spotifyTrack.duration_ms / 1000) : 0,
        },
        [spotifyMetadataSource],
      );

      const trackMetadata: TrackMetadata = {
        year: spotifyTrack.album?.release_date ? Number.parseInt(spotifyTrack.album.release_date.slice(0, 4), 10) : undefined,
        format: 'spotify',
        isrc: spotifyTrack.external_ids?.isrc || enrichedMetadata?.isrc,
        label: enrichedMetadata?.label,
        releaseDate: spotifyTrack.album?.release_date || enrichedMetadata?.releaseDate,
        coverArtUrl: spotifyTrack.album?.images?.[0]?.url || enrichedMetadata?.coverArtUrl,
        musicbrainzId: enrichedMetadata?.musicbrainzId,
        spotifyId: trackId,
      };

      const genreIds: string[] = [];
      if (enrichedMetadata?.genres && enrichedMetadata.genres.length > 0) {
        for (const genreName of enrichedMetadata.genres) {
          const normalizedName = genreName
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          const { id: genreId } = await genreRepository.getOrCreate({ name: normalizedName }, `name = "${normalizedName}"`);
          genreIds.push(genreId);
        }
      }

      const track = await trackRepository.getOrCreate(
        {
          title: spotifyTrack.name,
          duration: spotifyTrack.duration_ms ? Math.floor(spotifyTrack.duration_ms / 1000) : 0,
          sourceUrl: externalUrl,
          provider: provider.id,
          artists: artistIds,
          album: album.id,
          genres: genreIds,
          metadata: trackMetadata,
        },
        `sourceUrl = "${externalUrl}"`,
      );

      return [track];
    } catch (error) {
      logger.error(`[Spotify] Error getting track: ${error}`);
      throw error;
    }
  }

  /**
   * Extract Spotify track ID from URL or URI
   * @private
   */
  private extractTrackId(url: string): string {
    if (url.startsWith('spotify:track:')) {
      return url.replace('spotify:track:', '');
    }
    const match = url.match(/track\/([a-zA-Z0-9]+)/);
    if (match?.[1]) {
      return match[1];
    }
    throw new Error('Invalid Spotify URL or URI');
  }
}

export const spotifySource = new SpotifySource();
