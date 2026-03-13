import type { PluginImportTrack } from '@melody-manager/plugin-sdk';
import type { Track, TrackProvider } from '@melody-manager/shared';
import { normalizeTrackTitle } from '@melody-manager/shared';
import { albumRepository, artistRepository, genreRepository, trackRepository } from '../repositories';

export const importPersistService = {
  persistImportTracks: async (provider: TrackProvider, importTracks: PluginImportTrack[]): Promise<Track[]> => {
    const tracks: Track[] = [];

    for (const t of importTracks) {
      const { id: artistId } = await artistRepository.getOrCreate({ name: t.artistName }, `name = "${t.artistName.replace(/"/g, '\\"')}"`);

      const albumData: { name: string; artists: string[]; coverUrl?: string; year?: number } = {
        name: t.albumName,
        artists: [artistId],
      };
      if (t.coverUrl) {
        albumData.coverUrl = t.coverUrl;
      }
      if (t.metadata?.year) {
        albumData.year = t.metadata.year;
      }

      const album = await albumRepository.getOrCreate(albumData, `name = "${t.albumName.replace(/"/g, '\\"')}"`);
      const albumUpdate: { coverUrl?: string; year?: number } = {};
      if (!album.coverUrl && t.coverUrl) {
        albumUpdate.coverUrl = t.coverUrl;
      }
      if (!album.year && t.metadata?.year) {
        albumUpdate.year = t.metadata.year;
      }
      if (Object.keys(albumUpdate).length > 0) {
        await albumRepository.update(album.id, albumUpdate);
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
          const { id: genreId } = await genreRepository.getOrCreate({ name: normalizedName }, `name = "${normalizedName.replace(/"/g, '\\"')}"`);
          genreIds.push(genreId);
        }
      }

      const metadata = t.metadata;

      const track = await trackRepository.getOrCreate(
        {
          title: normalizeTrackTitle(t.title),
          duration: t.duration,
          sourceUrl: t.sourceUrl,
          provider: provider.id,
          artists: [artistId],
          album: albumId,
          genres: genreIds,
          metadata,
        },
        `sourceUrl = "${t.sourceUrl.replace(/"/g, '\\"')}"${metadata?.startTime != null ? ` && metadata.startTime = ${metadata.startTime}` : ''}`,
      );
      tracks.push(track);
    }

    return tracks;
  },
};
