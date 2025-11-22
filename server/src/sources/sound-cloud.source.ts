import type { Album, SoundcloudTrackProvider, Track, TrackMetadata, TrackSearchResult } from '@melody-manager/shared';
import { $ } from 'bun';
import { logger } from '../lib/logger';
import { soundcloudMetadataSource } from '../metadata-sources';
import { albumRepository, artistRepository, genreRepository, trackRepository } from '../repositories';
import { metadataSourceService, ytDlpService } from '../services';
import type { TrackSource, YtDlpTrackInfo } from '../types';

class SoundCloudSource implements TrackSource<SoundcloudTrackProvider> {
  async searchTracks(query: string): Promise<TrackSearchResult[]> {
    try {
      const searchQuery = `scsearch20:${query}`;
      // Don't use --flat-playlist for SoundCloud to get full metadata including thumbnails
      const result = await $`yt-dlp -j ${searchQuery}`.text();
      const lines = result
        .trim()
        .split('\n')
        .filter((line) => line.trim() !== '');
      const results: YtDlpTrackInfo[] = lines.map((line) => JSON.parse(line));

      return results.map((info) => ({
        type: 'track' as const,
        provider: 'soundcloud',
        title: info.title ?? 'Unknown Title',
        artist: info.artist ?? info.uploader,
        album: info.album,
        thumbnail: info.thumbnail,
        externalUrl: info.webpage_url,
        duration: info.duration ? Math.floor(info.duration) : undefined,
      }));
    } catch (error) {
      logger.error(`Error searching SoundCloud: ${error}`);
      return [];
    }
  }

  async getTracks(url: string, provider: SoundcloudTrackProvider): Promise<Track[]> {
    try {
      const trackInfo = await ytDlpService.extractTrackInfo(url);
      if (!trackInfo) {
        throw new Error('Failed to extract track info from SoundCloud URL');
      }

      const artistName = trackInfo.artist ?? trackInfo.uploader ?? 'Unknown Artist';
      const { id: artistId } = await artistRepository.getOrCreate({ name: artistName }, `name = "${artistName}"`);

      const albumName = trackInfo.album ?? `${trackInfo.uploader} - SoundCloud`;
      const albumData: Partial<Album> = {
        name: albumName,
        artists: [artistId],
      };

      if (trackInfo.thumbnail) {
        albumData.coverUrl = trackInfo.thumbnail;
      }

      const album = await albumRepository.getOrCreate(albumData, `name = "${albumName}"`);

      const enrichedMetadata = await metadataSourceService.getMetadataWithSources(
        {
          sourceUrl: trackInfo.webpage_url,
          title: trackInfo.title,
          artist: artistName,
          album: albumName,
          duration: trackInfo.duration,
        },
        [soundcloudMetadataSource],
      );

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

      const metadata: TrackMetadata = {
        year: trackInfo.upload_date ? Number.parseInt(trackInfo.upload_date.slice(0, 4), 10) : undefined,
        bitrate: trackInfo.tbr,
        format: trackInfo.ext,
        isrc: enrichedMetadata?.isrc,
        label: enrichedMetadata?.label,
        releaseDate: enrichedMetadata?.releaseDate,
        coverArtUrl: enrichedMetadata?.coverArtUrl,
        musicbrainzId: enrichedMetadata?.musicbrainzId,
      };

      const track = await trackRepository.getOrCreate(
        {
          title: trackInfo.title,
          duration: Math.floor(trackInfo.duration),
          sourceUrl: trackInfo.webpage_url,
          provider: provider.id,
          artists: [artistId],
          album: album.id,
          genres: genreIds,
          metadata,
        },
        `sourceUrl = "${trackInfo.webpage_url}"`,
      );

      return [track];
    } catch (error) {
      logger.error(`Error getting tracks from SoundCloud URL ${url}: ${error}`);
      throw error;
    }
  }
}

export const soundCloudSource = new SoundCloudSource();
