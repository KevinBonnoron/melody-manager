import type { PluginImportTrack } from '@melody-manager/plugin-sdk';
import type { Track, TrackProvider } from '@melody-manager/shared';
import { normalizeTrackTitle } from '@melody-manager/shared';
import { uploadImageToRecord } from '../lib/image-upload';
import { pbFilter } from '../lib/pocketbase';
import { albumRepository, artistRepository, genreRepository, trackRepository } from '../repositories';

export const importPersistService = {
  persistImportTracks: async (provider: TrackProvider, importTracks: PluginImportTrack[]): Promise<Track[]> => {
    const tracks: Track[] = [];

    for (const t of importTracks) {
      const artistNames = t.artistName
        .split(' & ')
        .map((n) => n.trim())
        .filter(Boolean);
      const artistIds: string[] = [];
      for (const name of artistNames) {
        const { id } = await artistRepository.getOrCreate({ name }, pbFilter('name = {:name}', { name }));
        artistIds.push(id);
      }

      const albumData: { name: string; artists: string[]; year?: number } = {
        name: t.albumName,
        artists: artistIds,
      };
      if (t.metadata?.year) {
        albumData.year = t.metadata.year;
      }

      const primaryArtistId = artistIds[0];
      const albumFilter = primaryArtistId ? pbFilter('name = {:name} && artists.id ?= {:artistId}', { name: t.albumName, artistId: primaryArtistId }) : pbFilter('name = {:name}', { name: t.albumName });
      const album = await albumRepository.getOrCreate(albumData, albumFilter);

      if (!album.year && t.metadata?.year) {
        await albumRepository.update(album.id, { year: t.metadata.year });
      }
      if (!album.cover && t.coverUrl) {
        await uploadImageToRecord('albums', album.id, 'cover', t.coverUrl);
      }
      const albumId = album.id;

      const genreIds: string[] = [];
      if (t.genreNames?.length) {
        for (const genreName of t.genreNames) {
          const normalizedName = genreName
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          const { id: genreId } = await genreRepository.getOrCreate({ name: normalizedName }, pbFilter('name = {:name}', { name: normalizedName }));
          genreIds.push(genreId);
        }
      }

      const metadata = t.metadata ? { ...t.metadata, coverArtUrl: t.metadata.coverArtUrl?.startsWith('data:') ? undefined : t.metadata.coverArtUrl } : undefined;

      const track = await trackRepository.getOrCreate(
        {
          title: normalizeTrackTitle(t.title),
          duration: t.duration,
          sourceUrl: t.sourceUrl,
          provider: provider.id,
          artists: artistIds,
          album: albumId,
          genres: genreIds,
          metadata,
        },
        metadata?.startTime != null ? pbFilter('sourceUrl = {:sourceUrl} && metadata.startTime = {:startTime}', { sourceUrl: t.sourceUrl, startTime: metadata.startTime }) : pbFilter('sourceUrl = {:sourceUrl}', { sourceUrl: t.sourceUrl }),
      );
      tracks.push(track);
    }

    return tracks;
  },
};
