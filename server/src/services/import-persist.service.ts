import type { ResolvedAlbum, ResolvedArtist, ResolvedPlaylist, ResolvedTrack, Track, TrackProvider } from '@melody-manager/shared';
import { normalizeTrackTitle } from '@melody-manager/shared';
import { uploadImageToRecord } from '../lib/image-upload';
import { pbFilter } from '../lib/pocketbase';
import { albumRepository, artistRepository, genreRepository, playlistLikeRepository, playlistRepository, trackRepository } from '../repositories';

async function resolveArtistIds(artistName: string): Promise<string[]> {
  const artistNames = artistName
    .split(' & ')
    .map((n) => n.trim())
    .filter(Boolean);
  const artistIds: string[] = [];

  for (const name of artistNames) {
    const { id } = await artistRepository.getOrCreate({ name }, pbFilter('name = {:name}', { name }));
    artistIds.push(id);
  }

  return artistIds;
}

async function resolveGenreIds(genreNames?: string[]): Promise<string[]> {
  if (!genreNames?.length) {
    return [];
  }

  const genreIds: string[] = [];

  for (const genreName of genreNames) {
    const normalizedName = genreName
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    const { id: genreId } = await genreRepository.getOrCreate({ name: normalizedName }, pbFilter('name = {:name}', { name: normalizedName }));
    genreIds.push(genreId);
  }

  return genreIds;
}

function cleanMetadata(metadata?: ResolvedTrack['metadata']) {
  if (!metadata) {
    return undefined;
  }

  return { ...metadata, coverArtUrl: metadata.coverArtUrl?.startsWith('data:') ? undefined : metadata.coverArtUrl };
}

async function persistSingleTrack(providerId: string, t: ResolvedTrack, artistIds: string[], albumId: string): Promise<Track> {
  const genreIds = await resolveGenreIds(t.genreNames);
  const metadata = cleanMetadata(t.metadata);

  return trackRepository.getOrCreate(
    {
      title: normalizeTrackTitle(t.title),
      duration: t.duration,
      sourceUrl: t.sourceUrl,
      provider: providerId,
      artists: artistIds,
      album: albumId,
      genres: genreIds,
      metadata,
    },
    metadata?.startTime != null ? pbFilter('sourceUrl = {:sourceUrl} && metadata.startTime = {:startTime}', { sourceUrl: t.sourceUrl, startTime: metadata.startTime }) : pbFilter('sourceUrl = {:sourceUrl}', { sourceUrl: t.sourceUrl }),
  );
}

export const importPersistService = {
  persistTracks: async (provider: TrackProvider, resolvedTracks: ResolvedTrack[]): Promise<Track[]> => {
    const tracks: Track[] = [];

    for (const t of resolvedTracks) {
      const artistIds = await resolveArtistIds(t.artistName);

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

      const track = await persistSingleTrack(provider.id, t, artistIds, album.id);
      tracks.push(track);
    }

    return tracks;
  },

  persistAlbum: async (provider: TrackProvider, album: ResolvedAlbum): Promise<Track[]> => {
    const artistIds = await resolveArtistIds(album.artistName);

    const firstTrackYear = album.tracks[0]?.metadata?.year;
    const albumData: { name: string; artists: string[]; year?: number } = {
      name: album.name,
      artists: artistIds,
    };

    if (firstTrackYear) {
      albumData.year = firstTrackYear;
    }

    const primaryArtistId = artistIds[0];
    const albumFilter = primaryArtistId ? pbFilter('name = {:name} && artists.id ?= {:artistId}', { name: album.name, artistId: primaryArtistId }) : pbFilter('name = {:name}', { name: album.name });
    const albumRecord = await albumRepository.getOrCreate(albumData, albumFilter);

    if (!albumRecord.year && firstTrackYear) {
      await albumRepository.update(albumRecord.id, { year: firstTrackYear });
    }

    if (!albumRecord.cover && album.coverUrl) {
      await uploadImageToRecord('albums', albumRecord.id, 'cover', album.coverUrl);
    }

    const tracks: Track[] = [];

    for (const t of album.tracks) {
      const track = await persistSingleTrack(provider.id, t, artistIds, albumRecord.id);
      tracks.push(track);
    }

    return tracks;
  },

  persistArtist: async (provider: TrackProvider, artist: ResolvedArtist): Promise<Track[]> => {
    return importPersistService.persistTracks(provider, artist.tracks);
  },

  persistPlaylist: async (provider: TrackProvider, playlist: ResolvedPlaylist, userId?: string | null): Promise<Track[]> => {
    const tracks = await importPersistService.persistTracks(provider, playlist.tracks);

    if (tracks.length > 0) {
      const trackIds = tracks.map((t) => t.id);
      const filter = playlist.sourceUrl ? pbFilter('sourceUrl = {:sourceUrl}', { sourceUrl: playlist.sourceUrl }) : pbFilter('name = {:name}', { name: playlist.name });
      const playlistRecord = await playlistRepository.getOrCreate(
        {
          name: playlist.name,
          description: playlist.description,
          coverUrl: playlist.coverUrl,
          sourceUrl: playlist.sourceUrl,
          tracks: trackIds,
        },
        filter,
      );

      if (playlist.coverUrl && !playlistRecord.cover) {
        await uploadImageToRecord('playlists', playlistRecord.id, 'cover', playlist.coverUrl);
      }

      if (userId) {
        const likeFilter = pbFilter('user = {:userId} && playlist = {:playlistId}', { userId, playlistId: playlistRecord.id });
        const existingLike = await playlistLikeRepository.getOneBy(likeFilter);

        if (!existingLike) {
          try {
            await playlistLikeRepository.create({ user: userId, playlist: playlistRecord.id });
          } catch {
            // Ignore duplicate — concurrent request may have created it
          }
        }
      }
    }

    return tracks;
  },
};
