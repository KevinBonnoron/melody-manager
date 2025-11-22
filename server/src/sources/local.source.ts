import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Album, LocalTrackProvider, Track, TrackMetadata, TrackSearchResult } from '@melody-manager/shared';
import { localMetadataSource } from '../metadata-sources';
import { albumRepository, artistRepository, genreRepository, trackRepository } from '../repositories';
import { metadataService, metadataSourceService } from '../services';
import type { TrackSource } from '../types';

class LocalSource implements TrackSource<LocalTrackProvider> {
  /**
   * Local files don't support search
   */
  async searchTracks(query: string, provider: LocalTrackProvider): Promise<TrackSearchResult[]> {
    return [];
  }

  private async scanDirectory(dirPath: string, provider: LocalTrackProvider): Promise<void> {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath, provider);
      } else if (entry.isFile()) {
        const filePath = fullPath;
        const metadata = await metadataService.extractMetadata(filePath);
        if (!metadata.title || !metadata.duration || !metadata.album) {
          continue;
        }

        const artistIds = await Promise.all(
          metadata.artists.map(async (artist) => {
            const { id } = await artistRepository.getOrCreate({ name: artist }, `name = "${artist}"`);
            return id;
          }),
        );

        const albumData: Partial<Album> = { name: metadata.album, artists: artistIds };

        if (metadata.coverImage) {
          const blob = new Blob([metadata.coverImage.data], { type: metadata.coverImage.format });
          albumData.coverUrl = blob.toString();
        }

        const album = await albumRepository.getOrCreate(albumData, `name = "${metadata.album}"`);

        const enrichedMetadata = await metadataSourceService.getMetadataWithSources(
          {
            filePath,
            title: metadata.title,
            artist: metadata.artists[0],
            album: metadata.album,
            duration: metadata.duration,
          },
          [localMetadataSource],
        );

        const trackMetadata: TrackMetadata = {
          year: metadata.year,
          bitrate: metadata.bitrate,
          format: metadata.format,
          isrc: enrichedMetadata?.isrc,
          label: enrichedMetadata?.label,
          releaseDate: enrichedMetadata?.releaseDate,
          coverArtUrl: enrichedMetadata?.coverArtUrl,
          musicbrainzId: enrichedMetadata?.musicbrainzId,
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

        await trackRepository.getOrCreate(
          {
            title: metadata.title,
            duration: Math.floor(metadata.duration),
            sourceUrl: `file://${filePath}`,
            provider: provider.id,
            artists: artistIds,
            album: album.id,
            genres: genreIds,
            metadata: trackMetadata,
          },
          `sourceUrl = "file://${filePath}"`,
        );
      }
    }
  }

  async getTracks(url: string, provider: LocalTrackProvider): Promise<Track[]> {
    const { path } = provider.config;

    const tracks: Track[] = [];
    await this.scanDirectory(path, provider);
    return tracks;
  }
}

export const localSource = new LocalSource();
