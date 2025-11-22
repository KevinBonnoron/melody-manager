import type { Track, TrackProvider } from '@melody-manager/shared';
import { normalizeTrackTitle } from '@melody-manager/shared';
import type { PluginImportTrack } from '@melody-manager/plugin-sdk';
import { albumRepository, artistRepository, genreRepository, trackRepository } from '../repositories';
import { metadataSourceService } from './metadata-source.service';
import { soundcloudMetadataSource, spotifyMetadataSource, youtubeMetadataSource } from '../metadata-sources';

export async function persistImportTracks(provider: TrackProvider, importTracks: PluginImportTrack[]): Promise<Track[]> {
  const tracks: Track[] = [];

  for (const t of importTracks) {
    const { id: artistId } = await artistRepository.getOrCreate({ name: t.artistName }, `name = "${t.artistName.replace(/"/g, '\\"')}"`);

    const albumData: { name: string; artists: string[]; coverUrl?: string } = {
      name: t.albumName,
      artists: [artistId],
    };
    if (t.coverUrl) albumData.coverUrl = t.coverUrl;

    const { id: albumId } = await albumRepository.getOrCreate(albumData, `name = "${t.albumName.replace(/"/g, '\\"')}"`);

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

    let metadata = t.metadata;
    const metadataSources = provider.type === 'youtube' ? [youtubeMetadataSource] : provider.type === 'soundcloud' ? [soundcloudMetadataSource] : provider.type === 'spotify' ? [spotifyMetadataSource] : [];
    if (metadataSources.length > 0 && t.sourceUrl) {
      const enriched = await metadataSourceService.getMetadataWithSources(
        {
          sourceUrl: t.sourceUrl,
          title: t.title,
          artist: t.artistName,
          album: t.albumName,
          duration: t.duration,
        },
        metadataSources,
      );
      if (enriched) {
        metadata = {
          ...t.metadata,
          isrc: enriched.isrc,
          label: enriched.label,
          releaseDate: enriched.releaseDate,
          coverArtUrl: enriched.coverArtUrl,
          musicbrainzId: enriched.musicbrainzId,
          youtubeId: enriched.youtubeId,
          spotifyId: enriched.spotifyId,
        };
      }
    }

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
}
