import { Hono } from 'hono';
import { pb, pbFilter } from '../lib/pocketbase';

export const statsRoute = new Hono()
  .get('/play-counts', async (c) => {
    const userId = c.get('userId') as string | null;
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const records = await pb.collection('track_plays').getFullList({
      filter: pbFilter('user = {:userId} && completed = true', { userId }),
      fields: 'track',
    });

    const counts = new Map<string, number>();
    for (const r of records) {
      counts.set(r.track, (counts.get(r.track) ?? 0) + 1);
    }

    return c.json(Object.fromEntries(counts));
  })
  .get('/overview', async (c) => {
    const userId = c.get('userId') as string | null;
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const records = await pb.collection('track_plays').getFullList({
      filter: pbFilter('user = {:userId} && completed = true', { userId }),
      fields: 'track,created',
    });

    const tracks = await pb.collection('tracks').getFullList({
      fields: 'id,duration,artists,album,genres',
    });

    const trackMap = new Map(tracks.map((t) => [t.id, t]));

    // Count plays per track
    const trackCounts = new Map<string, number>();
    for (const r of records) {
      trackCounts.set(r.track, (trackCounts.get(r.track) ?? 0) + 1);
    }

    // Total plays
    const totalPlays = records.length;

    // Total listening time
    let totalSeconds = 0;
    for (const [trackId, count] of trackCounts) {
      const track = trackMap.get(trackId);
      if (track) {
        totalSeconds += track.duration * count;
      }
    }

    // Top tracks
    const topTracks = [...trackCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([trackId, count]) => ({ trackId, count }));

    // Top artists
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

    // Top albums
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

    // Top genres
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

    // Plays per month
    const monthlyPlays = new Map<string, number>();
    for (const r of records) {
      const month = r.created.substring(0, 7); // "YYYY-MM"
      monthlyPlays.set(month, (monthlyPlays.get(month) ?? 0) + 1);
    }
    const playsByMonth = [...monthlyPlays.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, count]) => ({ month, count }));

    return c.json({
      totalPlays,
      totalSeconds,
      uniqueTracks: trackCounts.size,
      uniqueArtists: artistCounts.size,
      topTracks,
      topArtists,
      topAlbums,
      topGenres,
      playsByMonth,
    });
  });
