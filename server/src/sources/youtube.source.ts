import type { Album, Artist, AlbumSearchResult, ArtistSearchResult, PlaylistSearchResult, Track, TrackMetadata, TrackSearchResult, YoutubeTrackProvider } from '@melody-manager/shared';
import { normalizeTrackTitle } from '@melody-manager/shared';
import type { YtDlpChannelInfo } from '@melody-manager/plugin-sdk';
import { youtubeMetadataSource } from '../metadata-sources';
import { albumRepository, artistRepository, genreRepository, trackRepository } from '../repositories';
import { metadataSourceService, ytDlpService } from '../services';
import type { TrackSource } from '../types';
import { logger } from '../lib/logger';

const CHANNEL_INFO_CACHE_MAX = 100;

class YoutubeSource implements TrackSource<YoutubeTrackProvider> {
  private readonly channelInfoCache = new Map<string, YtDlpChannelInfo | null>();
  /**
   * Check if a query is a YouTube URL
   */
  private isYoutubeUrl(query: string): boolean {
    return query.includes('youtube.com/watch') || query.includes('youtu.be/') || query.includes('youtube.com/shorts/');
  }

  /**
   * Check if a query is a YouTube playlist URL
   */
  private isYoutubePlaylistUrl(query: string): boolean {
    return query.includes('youtube.com/playlist') || query.includes('list=');
  }

  /**
   * Search for YouTube videos by query
   * If query is a URL, extract info directly instead of searching
   * @param query - Search query string or YouTube URL
   * @returns Array of track search results with video metadata
   */
  async searchTracks(query: string): Promise<TrackSearchResult[]> {
    try {
      // If query is a YouTube URL, extract track info directly
      if (this.isYoutubeUrl(query)) {
        const trackInfo = await ytDlpService.extractTrackInfo(query);
        if (!trackInfo) {
          return [];
        }

        return [
          {
            type: 'track' as const,
            provider: 'youtube',
            title: normalizeTrackTitle(trackInfo.title ?? 'Unknown Title'),
            artist: trackInfo.artist ?? trackInfo.uploader ?? trackInfo.channel,
            album: trackInfo.album,
            thumbnail: trackInfo.thumbnail,
            externalUrl: trackInfo.webpage_url,
            duration: trackInfo.duration ? Math.floor(trackInfo.duration) : undefined,
          },
        ];
      }

      // Otherwise, search normally
      const results = await ytDlpService.searchYoutube(query, 20);
      return results.map((info) => ({
        type: 'track' as const,
        provider: 'youtube',
        title: normalizeTrackTitle(info.title ?? 'Unknown Title'),
        artist: info.artist ?? info.uploader ?? info.channel,
        album: info.album,
        thumbnail: info.thumbnail,
        externalUrl: info.webpage_url,
        duration: info.duration ? Math.floor(info.duration) : undefined,
      }));
    } catch (error) {
      logger.error(`Error searching YouTube: ${error}`);
      return [];
    }
  }

  /**
   * Search for YouTube albums (videos with chapters or playlists)
   * If query is a URL, extract info directly instead of searching
   * @param query - Search query string or YouTube URL
   * @returns Array of album search results
   */
  async searchAlbums(query: string): Promise<AlbumSearchResult[]> {
    try {
      // If query is a YouTube URL with chapters or playlist, extract album info directly
      if (this.isYoutubeUrl(query) || this.isYoutubePlaylistUrl(query)) {
        if (this.isYoutubePlaylistUrl(query)) {
          // For playlists, we'd need to extract playlist info
          // For now, fall through to search
        } else {
          const trackInfo = await ytDlpService.extractTrackInfo(query);
          if (trackInfo && trackInfo.chapters && trackInfo.chapters.length > 0) {
            return [
              {
                type: 'album' as const,
                provider: 'youtube',
                name: trackInfo.title ?? 'Unknown Album',
                artist: trackInfo.artist ?? trackInfo.uploader ?? trackInfo.channel,
                coverUrl: trackInfo.thumbnail,
                externalUrl: trackInfo.webpage_url,
                trackCount: trackInfo.chapters.length,
              },
            ];
          }
        }
      }

      // Otherwise, search normally
      const results = await ytDlpService.searchYoutubeAlbums(query, 20);
      return results.map((info) => ({
        type: 'album' as const,
        provider: 'youtube',
        name: info.title ?? 'Unknown Album',
        artist: info.artist ?? info.uploader ?? info.channel,
        coverUrl: info.thumbnail,
        externalUrl: info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`,
        // Don't show track count from flat-playlist as it's unreliable
        // The actual count will be determined when adding the album
        trackCount: undefined,
      }));
    } catch (error) {
      logger.error(`Error searching YouTube albums: ${error}`);
      return [];
    }
  }

  /**
   * Search for YouTube artist channels (Topic channels)
   * @param query - Search query string (artist name)
   * @returns Array of artist search results
   */
  async searchArtists(query: string): Promise<ArtistSearchResult[]> {
    try {
      const results = await ytDlpService.searchYoutubeArtists(query, 20);
      return results.map((info) => ({
        type: 'artist' as const,
        provider: 'youtube',
        name: (info.channel || info.uploader || info.title)?.replace(' - Topic', '') ?? 'Unknown Artist',
        imageUrl: info.thumbnail,
        externalUrl: info.channel_url || info.uploader_url || info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`,
      }));
    } catch (error) {
      logger.error(`Error searching YouTube artists: ${error}`);
      return [];
    }
  }

  /**
   * Search for YouTube playlists
   * @param query - Search query string
   * @returns Array of playlist search results
   */
  async searchPlaylists(query: string): Promise<PlaylistSearchResult[]> {
    try {
      const results = await ytDlpService.searchYoutubePlaylists(query, 20);
      return results.map((info) => ({
        type: 'playlist' as const,
        provider: 'youtube',
        name: info.title ?? 'Unknown Playlist',
        description: info.description,
        coverUrl: info.thumbnail,
        externalUrl: info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`,
        trackCount: info.playlist_count,
        owner: info.uploader ?? info.channel,
      }));
    } catch (error) {
      logger.error(`Error searching YouTube playlists: ${error}`);
      return [];
    }
  }

  /**
   * Get or create tracks from YouTube URL
   * @param url - YouTube video URL
   * @param provider - YouTube track provider configuration
   * @returns Array of created/existing tracks (multiple if chapters split)
   */
  async getTracks(url: string, provider: YoutubeTrackProvider): Promise<Track[]> {
    try {
      const trackInfo = await ytDlpService.extractTrackInfo(url);
      if (!trackInfo) {
        throw new Error('Failed to extract track info from URL');
      }

      return await this.createTracksFromInfo(trackInfo, provider);
    } catch (error) {
      logger.error(`Error getting tracks from URL ${url}: ${error}`);
      throw error;
    }
  }

  /**
   * Get or create an artist, optionally fetching and storing channel info (bio, imageUrl, externalUrl) from YouTube.
   * Channel info is cached per URL to avoid repeated yt-dlp calls when importing many tracks from the same channel.
   */
  private async getOrCreateArtistWithChannelInfo(artistName: string, channelUrl?: string): Promise<string> {
    const escapedName = artistName.replace(/"/g, '\\"');
    let artistData: Partial<Artist> = { name: artistName };

    if (channelUrl?.includes('youtube.com') || channelUrl?.includes('youtu.be')) {
      let channelInfo = this.channelInfoCache.get(channelUrl);
      if (channelInfo === undefined) {
        logger.info(`Fetching artist channel info from YouTube: ${artistName}`);
        channelInfo = await ytDlpService.extractChannelInfo(channelUrl);
        this.channelInfoCache.set(channelUrl, channelInfo);
        if (this.channelInfoCache.size > CHANNEL_INFO_CACHE_MAX) {
          const firstKey = this.channelInfoCache.keys().next().value;
          if (firstKey !== undefined) this.channelInfoCache.delete(firstKey);
        }
      }
      if (channelInfo) {
        if (channelInfo.description) artistData.bio = channelInfo.description;
        if (channelInfo.thumbnail) artistData.imageUrl = channelInfo.thumbnail;
        if (channelInfo.channel_url) artistData.externalUrl = channelInfo.channel_url;
      }
    }

    const artist = await artistRepository.getOrCreate(artistData, `name = "${escapedName}"`);
    const updates: Partial<Artist> = {};
    if (artistData.bio !== undefined) updates.bio = artistData.bio;
    if (artistData.imageUrl !== undefined) updates.imageUrl = artistData.imageUrl;
    if (artistData.externalUrl !== undefined) updates.externalUrl = artistData.externalUrl;
    if (Object.keys(updates).length > 0) {
      try {
        await artistRepository.update(artist.id, updates);
      } catch (error) {
        logger.error(`Failed to update artist ${artist.id} with channel info: ${error}`);
      }
    }
    return artist.id;
  }

  /**
   * Create tracks from yt-dlp track info (handles chapter splitting)
   * @private
   */
  private async createTracksFromInfo(trackInfo: any, provider: YoutubeTrackProvider): Promise<Track[]> {
    const createdTracks: Track[] = [];

    const artistName = trackInfo.artist ?? trackInfo.uploader ?? trackInfo.channel ?? 'Unknown Artist';
    const channelUrl = trackInfo.channel_url ?? trackInfo.uploader_url;
    const artistId = await this.getOrCreateArtistWithChannelInfo(artistName, channelUrl);

    const albumName = trackInfo.album ?? `${trackInfo.channel ?? trackInfo.uploader} - YouTube`;
    const albumData: Partial<Album> = {
      name: albumName,
      artists: [artistId],
    };

    if (trackInfo.thumbnail) {
      albumData.coverUrl = trackInfo.thumbnail;
    }

    if (provider.config.splitChapters && trackInfo.chapters && trackInfo.chapters.length > 0) {
      const videoAlbumName = trackInfo.title;
      const videoAlbumData: Partial<Album> = {
        name: videoAlbumName,
        artists: [artistId],
      };
      if (trackInfo.thumbnail) {
        videoAlbumData.coverUrl = trackInfo.thumbnail;
      }
      const videoAlbum = await albumRepository.getOrCreate(videoAlbumData, `name = "${videoAlbumName}"`);

      // Get metadata once for the entire video (shared across all chapters)
      const sharedMetadata = await metadataSourceService.getMetadataWithSources(
        {
          sourceUrl: trackInfo.webpage_url,
          title: trackInfo.title,
          artist: artistName,
          album: albumName,
          duration: trackInfo.duration,
        },
        [youtubeMetadataSource],
      );

      // Get genres once (shared across all chapters)
      const genreIds: string[] = [];
      if (sharedMetadata?.genres && sharedMetadata.genres.length > 0) {
        for (const genreName of sharedMetadata.genres) {
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

      for (const chapter of trackInfo.chapters) {
        if (!chapter) continue;

        const chapterMetadata: TrackMetadata = {
          year: trackInfo.upload_date ? Number.parseInt(trackInfo.upload_date.slice(0, 4), 10) : undefined,
          bitrate: trackInfo.tbr,
          format: trackInfo.ext,
          startTime: chapter.start_time,
          endTime: chapter.end_time,
          isrc: sharedMetadata?.isrc,
          label: sharedMetadata?.label,
          releaseDate: sharedMetadata?.releaseDate,
          coverArtUrl: sharedMetadata?.coverArtUrl,
          musicbrainzId: sharedMetadata?.musicbrainzId,
          youtubeId: sharedMetadata?.youtubeId,
        };

        const track = await trackRepository.getOrCreate(
          {
            title: normalizeTrackTitle(chapter.title),
            duration: Math.floor(chapter.end_time - chapter.start_time),
            sourceUrl: trackInfo.webpage_url,
            provider: provider.id,
            artists: [artistId],
            album: videoAlbum.id,
            genres: genreIds,
            metadata: chapterMetadata,
          },
          `sourceUrl = "${trackInfo.webpage_url}" && metadata.startTime = ${chapter.start_time}`,
        );

        createdTracks.push(track);
      }
    } else {
      const album = await albumRepository.getOrCreate(albumData, `name = "${albumName}"`);
      const enrichedMetadata = await metadataSourceService.getMetadataWithSources(
        {
          sourceUrl: trackInfo.webpage_url,
          title: trackInfo.title,
          artist: artistName,
          album: albumName,
          duration: trackInfo.duration,
        },
        [youtubeMetadataSource],
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
        chapters: trackInfo.chapters?.map((chapter: any) => ({
          title: normalizeTrackTitle(chapter.title),
          startTime: chapter.start_time,
          endTime: chapter.end_time,
        })),
        isrc: enrichedMetadata?.isrc,
        label: enrichedMetadata?.label,
        releaseDate: enrichedMetadata?.releaseDate,
        coverArtUrl: enrichedMetadata?.coverArtUrl,
        musicbrainzId: enrichedMetadata?.musicbrainzId,
        youtubeId: enrichedMetadata?.youtubeId,
      };

      const track = await trackRepository.getOrCreate(
        {
          title: normalizeTrackTitle(trackInfo.title),
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

      createdTracks.push(track);
    }

    return createdTracks;
  }

  /**
   * Get all tracks from a YouTube album (playlist or video with chapters)
   * @param url - Album URL (playlist or video)
   * @param provider - YouTube track provider configuration
   * @returns Array of tracks from the album
   */
  async getAlbumTracks(url: string, provider: YoutubeTrackProvider): Promise<Track[]> {
    try {
      if (url.includes('playlist') || url.includes('list=')) {
        return await this.getPlaylistTracks(url, provider);
      }

      const trackInfo = await ytDlpService.extractTrackInfo(url);
      if (!trackInfo) {
        throw new Error('Failed to extract album info from URL');
      }

      if (trackInfo.chapters && trackInfo.chapters.length > 0 && provider.config.splitChapters) {
        return await this.createTracksFromInfo(trackInfo, provider);
      }

      throw new Error('URL is not an album (no playlist or chapters found)');
    } catch (error) {
      logger.error(`Error getting album tracks from URL ${url}: ${error}`);
      throw error;
    }
  }

  /**
   * Create one track from a flat-playlist entry (no full yt-dlp fetch). Used for fast channel import.
   */
  private async createTrackFromFlatEntry(
    flatEntry: { title?: string; webpage_url?: string; duration?: number; thumbnail?: string; id?: string },
    artistId: string,
    albumId: string,
    provider: YoutubeTrackProvider,
  ): Promise<Track | null> {
    const sourceUrl = flatEntry.webpage_url;
    if (!sourceUrl) return null;

    const title = normalizeTrackTitle(flatEntry.title ?? 'Unknown Title');
    const duration = typeof flatEntry.duration === 'number' && flatEntry.duration > 0 ? Math.floor(flatEntry.duration) : 0;
    const escapedUrl = sourceUrl.replace(/"/g, '\\"');

    const metadata: TrackMetadata = {
      youtubeId: flatEntry.id,
      coverArtUrl: flatEntry.thumbnail,
    };

    const track = await trackRepository.getOrCreate(
      {
        title,
        duration,
        sourceUrl,
        provider: provider.id,
        artists: [artistId],
        album: albumId,
        genres: [],
        metadata,
      },
      `sourceUrl = "${escapedUrl}"`,
    );
    return track;
  }

  /**
   * Get all tracks from a YouTube artist (channel/topic channel).
   * Uses flat-playlist only (no full extractTrackInfo per video) so import stays fast.
   */
  async getArtistTracks(url: string, provider: YoutubeTrackProvider): Promise<Track[]> {
    try {
      const channelInfo = await ytDlpService.extractChannelInfo(url);
      const artistName =
        (channelInfo?.channel ?? channelInfo?.uploader ?? channelInfo?.title)?.replace(' - Topic', '') ?? 'Unknown Artist';
      const artistId = await this.getOrCreateArtistWithChannelInfo(artistName, url);

      const channelTracks = await ytDlpService.extractChannelTracks(url, 200);

      const albumName = `${artistName} - YouTube`;
      const albumData: Partial<Album> = {
        name: albumName,
        artists: [artistId],
        coverUrl: channelInfo?.thumbnail,
      };
      const album = await albumRepository.getOrCreate(albumData, `name = "${albumName.replace(/"/g, '\\"')}"`);

      const allTracks: Track[] = [];
      for (const flatEntry of channelTracks) {
        try {
          const track = await this.createTrackFromFlatEntry(flatEntry, artistId, album.id, provider);
          if (track) allTracks.push(track);
        } catch (error) {
          logger.error(`Error creating track from ${flatEntry.webpage_url}: ${error}`);
        }
      }

      return allTracks;
    } catch (error) {
      logger.error(`Error getting artist tracks from URL ${url}: ${error}`);
      throw error;
    }
  }

  /**
   * Get all tracks from a YouTube playlist.
   * Uses flat-playlist only (no full extractTrackInfo per video) so import stays fast.
   */
  async getPlaylistTracks(url: string, provider: YoutubeTrackProvider): Promise<Track[]> {
    try {
      const playlistTracks = await ytDlpService.extractPlaylistTracks(url);
      const allTracks: Track[] = [];

      for (const flatEntry of playlistTracks) {
        try {
          const artistName =
            (flatEntry.channel ?? flatEntry.uploader ?? flatEntry.artist)?.replace(' - Topic', '') ?? 'Unknown Artist';
          const channelUrl = flatEntry.channel_url ?? flatEntry.uploader_url;
          const artistId = await this.getOrCreateArtistWithChannelInfo(artistName, channelUrl);

          const albumName = `${artistName} - YouTube`;
          const album = await albumRepository.getOrCreate(
            { name: albumName, artists: [artistId], coverUrl: flatEntry.thumbnail },
            `name = "${albumName.replace(/"/g, '\\"')}"`,
          );

          const track = await this.createTrackFromFlatEntry(flatEntry, artistId, album.id, provider);
          if (track) allTracks.push(track);
        } catch (error) {
          logger.error(`Error creating track from ${flatEntry.webpage_url}: ${error}`);
        }
      }

      return allTracks;
    } catch (error) {
      logger.error(`Error getting playlist tracks from URL ${url}: ${error}`);
      throw error;
    }
  }
}

export const youtubeSource = new YoutubeSource();
