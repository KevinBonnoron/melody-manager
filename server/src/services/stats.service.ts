import { pbFilter } from '../lib/pocketbase';
import { trackPlayRepository, trackRepository } from '../repositories';

export const statsService = {
  async getPlayCounts(userId: string): Promise<Record<string, number>> {
    const records = await trackPlayRepository.getCompletedTrackCountsByUser(userId);

    const counts = new Map<string, number>();
    for (const r of records) {
      counts.set(r.track, (counts.get(r.track) ?? 0) + 1);
    }

    return Object.fromEntries(counts);
  },

  async getOverview(userId: string) {
    const records = await trackPlayRepository.getCompletedTrackIdsByUser(userId);

    const trackCounts = new Map<string, number>();
    for (const r of records) {
      trackCounts.set(r.track, (trackCounts.get(r.track) ?? 0) + 1);
    }

    const playedTrackIds = [...trackCounts.keys()];

    const playedTracks = playedTrackIds.length > 0 ? await trackRepository.getAllBy(pbFilter('id IN {:ids}', { ids: playedTrackIds })) : [];

    const trackMap = new Map(playedTracks.map((t) => [t.id, t]));

    const totalPlays = records.length;

    let totalSeconds = 0;
    for (const [trackId, count] of trackCounts) {
      const track = trackMap.get(trackId);
      if (track) {
        totalSeconds += track.duration * count;
      }
    }

    const topTracks = [...trackCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([trackId, count]) => ({ trackId, count }));

    const artistCounts = new Map<string, number>();
    for (const [trackId, count] of trackCounts) {
      const track = trackMap.get(trackId);
      if (track?.artists) {
        for (const artistId of track.artists) {
          artistCounts.set(artistId, (artistCounts.get(artistId) ?? 0) + count);
        }
      }
    }
    const topArtists = [...artistCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([artistId, count]) => ({ artistId, count }));

    const albumCounts = new Map<string, number>();
    for (const [trackId, count] of trackCounts) {
      const track = trackMap.get(trackId);
      if (track?.album) {
        albumCounts.set(track.album, (albumCounts.get(track.album) ?? 0) + count);
      }
    }
    const topAlbums = [...albumCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([albumId, count]) => ({ albumId, count }));

    const genreCounts = new Map<string, number>();
    for (const [trackId, count] of trackCounts) {
      const track = trackMap.get(trackId);
      if (track?.genres) {
        for (const genreId of track.genres) {
          genreCounts.set(genreId, (genreCounts.get(genreId) ?? 0) + count);
        }
      }
    }
    const topGenres = [...genreCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([genreId, count]) => ({ genreId, count }));

    const monthlyPlays = new Map<string, number>();
    for (const r of records) {
      const month = r.created.substring(0, 7);
      monthlyPlays.set(month, (monthlyPlays.get(month) ?? 0) + 1);
    }
    const playsByMonth = [...monthlyPlays.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, count]) => ({ month, count }));

    return {
      totalPlays,
      totalSeconds,
      uniqueTracks: trackCounts.size,
      uniqueArtists: artistCounts.size,
      topTracks,
      topArtists,
      topAlbums,
      topGenres,
      playsByMonth,
    };
  },
};
