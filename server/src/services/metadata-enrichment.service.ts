import type { Track } from '@melody-manager/shared';
import { uploadImageToRecord } from '../lib/image-upload';
import { logger } from '../lib/logger';
import { pbFilter } from '../lib/pocketbase';
import { deezerClient } from '../providers/deezer/deezer.client';
import { soundcloudClient } from '../providers/soundcloud/soundcloud.client';
import { youtubeClient } from '../providers/youtube/youtube.client';
import { albumRepository, artistRepository, trackRepository } from '../repositories';
import { musicBrainzClient } from './musicbrainz.service';
import { taskService } from './task.service';

class MetadataEnrichmentService {
  public enrichAfterImport(tracks: Track[]): void {
    const albumIds = [...new Set(tracks.map((t) => t.album))];
    const artistIds = [...new Set(tracks.flatMap((t) => t.artists))];
    const task = taskService.create('enrichment', 'Enriching metadata');
    this.runEnrichment(task.id, albumIds, artistIds).catch((err) => logger.error(`[enrichment] Failed: ${err}`));
  }

  public async enrichAll(): Promise<{ taskId: string }> {
    const albums = await albumRepository.getAllBy();
    const artists = await artistRepository.getAllBy();
    const albumIds = albums.map((a) => a.id);
    const artistIds = artists.map((a) => a.id);
    const task = taskService.create('enrichment', 'Enriching metadata');
    this.runEnrichment(task.id, albumIds, artistIds).catch((err) => logger.error(`[enrichment] Failed: ${err}`));
    return { taskId: task.id };
  }

  private async runEnrichment(taskId: string, albumIds: string[], artistIds: string[]): Promise<void> {
    const total = albumIds.length + artistIds.length;
    if (total === 0) {
      taskService.update(taskId, { status: 'completed', progress: 100 });
      return;
    }

    taskService.update(taskId, { status: 'running', progress: 0 });

    try {
      let processed = 0;

      // Enrich artists first so merges happen before album cover lookups
      for (const artistId of artistIds) {
        await this.enrichArtist(artistId);
        processed++;
        taskService.update(taskId, { progress: Math.round((processed / total) * 100) });
      }

      for (const albumId of albumIds) {
        await this.enrichAlbum(albumId);
        processed++;
        taskService.update(taskId, { progress: Math.round((processed / total) * 100) });
      }

      taskService.update(taskId, { status: 'completed', progress: 100 });
    } catch {
      taskService.update(taskId, { status: 'failed' });
    }
  }

  private async enrichAlbum(albumId: string): Promise<void> {
    const album = await albumRepository.getOne(albumId);
    if (!album || (album.cover && album.year)) {
      return;
    }

    const artistName = album.expand?.artists?.[0]?.name;
    if (!artistName) {
      return;
    }

    const release = await musicBrainzClient.searchRelease(album.name, artistName);
    if (!release) {
      return;
    }

    if (!album.year && release.year) {
      await albumRepository.update(albumId, { year: release.year });
    }

    if (!album.cover) {
      const coverUrl = await musicBrainzClient.getCoverArtUrl(release.mbid);
      if (coverUrl) {
        await uploadImageToRecord('albums', albumId, 'cover', coverUrl);
      }
    }
  }

  private async enrichArtist(artistId: string): Promise<void> {
    const artist = await artistRepository.getOne(artistId);
    if (!artist) {
      return;
    }

    const knownMbid = artist.metadata?.mbid;

    if (knownMbid && artist.image) {
      return;
    }

    // When MBID is known, fetch full details to get wikidataId for image lookup
    const mbArtist = knownMbid ? ((await musicBrainzClient.searchArtist(artist.name)) ?? { mbid: knownMbid, wikidataId: undefined }) : await musicBrainzClient.searchArtist(artist.name);

    if (mbArtist && !knownMbid) {
      // Check if another artist already has this MBID — if so, merge into it
      const existing = await artistRepository.getOneBy(pbFilter('metadata.mbid = {:mbid} && id != {:artistId}', { mbid: mbArtist.mbid, artistId: artist.id }));
      if (existing) {
        await this.mergeArtists(existing.id, artist.id);
        return;
      }

      await artistRepository.update(artistId, { metadata: { ...artist.metadata, mbid: mbArtist.mbid } });
    }

    if (!artist.image) {
      let imageUrl: string | null = null;

      if (mbArtist?.wikidataId) {
        imageUrl = await musicBrainzClient.getArtistImageUrl(mbArtist.wikidataId);
      }

      if (!imageUrl) {
        imageUrl = await deezerClient.getArtistImage(artist.name);
      }

      if (!imageUrl) {
        imageUrl = await this.findArtistImageFromTracks(artistId);
      }

      if (imageUrl) {
        await uploadImageToRecord('artists', artistId, 'image', imageUrl);
      } else {
        logger.info(`[enrichment] No image found for "${artist.name}"`);
      }
    }
  }

  /** Use the artist's existing tracks to find a suitable image (channel avatar for YouTube/SoundCloud, cover art fallback). */
  private async findArtistImageFromTracks(artistId: string): Promise<string | null> {
    const tracks = await trackRepository.getAllBy(pbFilter('artists.id ?= {:artistId}', { artistId }));

    for (const track of tracks) {
      if (track.sourceUrl.includes('youtube.com') || track.sourceUrl.includes('youtu.be')) {
        const avatar = await youtubeClient.getArtistImage(track.sourceUrl);
        if (avatar) {
          return avatar;
        }
      }
      if (track.sourceUrl.includes('soundcloud.com')) {
        const avatar = await soundcloudClient.getArtistImage(track.sourceUrl);
        if (avatar) {
          return avatar;
        }
      }
    }

    // Fallback to track cover art
    for (const track of tracks) {
      if (track.metadata?.coverArtUrl) {
        return track.metadata.coverArtUrl;
      }
    }

    return null;
  }

  /** Merge sourceArtistId into targetArtistId: reassign tracks/albums, then delete source. */
  private async mergeArtists(targetArtistId: string, sourceArtistId: string): Promise<void> {
    logger.info(`[enrichment] Merging artist ${sourceArtistId} into ${targetArtistId}`);

    const tracks = await trackRepository.getAllBy(pbFilter('artists.id ?= {:artistId}', { artistId: sourceArtistId }));
    for (const track of tracks) {
      const updatedArtists = track.artists.map((id) => (id === sourceArtistId ? targetArtistId : id));
      await trackRepository.update(track.id, { artists: [...new Set(updatedArtists)] });
    }

    const albums = await albumRepository.getAllBy(pbFilter('artists.id ?= {:artistId}', { artistId: sourceArtistId }));
    for (const album of albums) {
      const updatedArtists = album.artists.map((id) => (id === sourceArtistId ? targetArtistId : id));
      await albumRepository.update(album.id, { artists: [...new Set(updatedArtists)] });
    }

    await artistRepository.delete(sourceArtistId);
  }
}

export const metadataEnrichmentService = new MetadataEnrichmentService();
