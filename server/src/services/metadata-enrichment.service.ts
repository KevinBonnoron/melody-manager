import type { Track } from '@melody-manager/shared';

import { logger } from '../lib/logger';
import { pbFilter } from '../lib/pocketbase';
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
    if (!album || (album.coverUrl && album.year)) {
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

    const update: { coverUrl?: string; year?: number } = {};

    if (!album.coverUrl) {
      const coverUrl = await musicBrainzClient.getCoverArtUrl(release.mbid);
      if (coverUrl) {
        update.coverUrl = coverUrl;
      }
    }

    if (!album.year && release.year) {
      update.year = release.year;
    }

    if (Object.keys(update).length > 0) {
      await albumRepository.update(albumId, update);
    }
  }

  private async enrichArtist(artistId: string): Promise<void> {
    const artist = await artistRepository.getOne(artistId);
    if (!artist) {
      return;
    }

    const knownMbid = artist.metadata?.mbid;

    if (knownMbid && artist.imageUrl) {
      return;
    }

    const mbArtist = knownMbid ? { mbid: knownMbid, wikidataId: undefined } : await musicBrainzClient.searchArtist(artist.name);
    if (!mbArtist) {
      return;
    }

    // Check if another artist already has this MBID — if so, merge into it
    if (!knownMbid) {
      const existing = await artistRepository.getOneBy(pbFilter('metadata.mbid = {:mbid} && id != {:artistId}', { mbid: mbArtist.mbid, artistId: artist.id }));
      if (existing) {
        await this.mergeArtists(existing.id, artist.id);
        return;
      }
    }

    const update: { metadata?: { mbid: string }; imageUrl?: string } = {};

    if (!knownMbid) {
      update.metadata = { ...artist.metadata, mbid: mbArtist.mbid };
    }

    if (!artist.imageUrl && mbArtist.wikidataId) {
      const imageUrl = await musicBrainzClient.getArtistImageUrl(mbArtist.wikidataId);
      if (imageUrl) {
        update.imageUrl = imageUrl;
      }
    }

    if (Object.keys(update).length > 0) {
      await artistRepository.update(artistId, update);
    }
  }

  /** Merge sourceArtistId into targetArtistId: reassign tracks/albums, then delete source. */
  private async mergeArtists(targetArtistId: string, sourceArtistId: string): Promise<void> {
    logger.info(`[enrichment] Merging artist ${sourceArtistId} into ${targetArtistId}`);

    // Reassign tracks
    const tracks = await trackRepository.getAllBy(pbFilter('artists ?~ {:sourceArtistId}', { sourceArtistId }));
    for (const track of tracks) {
      const updatedArtists = track.artists.map((id) => (id === sourceArtistId ? targetArtistId : id));
      await trackRepository.update(track.id, { artists: [...new Set(updatedArtists)] });
    }

    // Reassign albums
    const albums = await albumRepository.getAllBy(pbFilter('artists ?~ {:sourceArtistId}', { sourceArtistId }));
    for (const album of albums) {
      const updatedArtists = album.artists.map((id) => (id === sourceArtistId ? targetArtistId : id));
      await albumRepository.update(album.id, { artists: [...new Set(updatedArtists)] });
    }

    await artistRepository.delete(sourceArtistId);
  }
}

export const metadataEnrichmentService = new MetadataEnrichmentService();
