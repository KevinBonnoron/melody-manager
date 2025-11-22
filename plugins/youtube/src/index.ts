import type { ImportProvider, PluginImportTrack, PluginStreamDeps, SearchProvider, StreamOptions, YtDlpTrackInfo } from '@melody-manager/plugin-sdk';
import type { AlbumSearchResult, ArtistSearchResult, PlaylistSearchResult, SearchResult, SearchType, TrackMetadata, TrackSearchResult, YoutubeTrackProvider } from '@melody-manager/shared';
import type { Context } from 'hono';
import { handleYouTubeStream } from './stream';

function isYoutubeUrl(query: string): boolean {
  return query.includes('youtube.com/watch') || query.includes('youtu.be/') || query.includes('youtube.com/shorts/');
}

function isYoutubePlaylistUrl(query: string): boolean {
  return query.includes('youtube.com/playlist') || query.includes('list=');
}

export class YoutubePlugin implements SearchProvider, ImportProvider {
  constructor(private readonly deps: PluginStreamDeps) {}

  get ytDlpService() {
    return this.deps.ytDlpService;
  }

  async search(query: string, type: SearchType, provider: YoutubeTrackProvider): Promise<SearchResult[]> {
    switch (type) {
      case 'track':
        return this.searchTracks(query, provider);
      case 'album':
        return this.searchAlbums(query, provider);
      case 'artist':
        return this.searchArtists(query, provider);
      case 'playlist':
        return this.searchPlaylists(query, provider);
      default:
        return [];
    }
  }

  async stream(c: Context, options: StreamOptions): Promise<Response> {
    return handleYouTubeStream(c, options, this.deps);
  }

  private async searchTracks(query: string, provider: YoutubeTrackProvider): Promise<TrackSearchResult[]> {
    try {
      if (isYoutubeUrl(query)) {
        const trackInfo = await this.ytDlpService.extractTrackInfo(query);
        if (!trackInfo) return [];
        return [
          {
            type: 'track',
            provider: 'youtube',
            title: trackInfo.title ?? 'Unknown Title',
            artist: trackInfo.artist ?? trackInfo.uploader ?? trackInfo.channel,
            album: trackInfo.album,
            thumbnail: trackInfo.thumbnail,
            externalUrl: trackInfo.webpage_url,
            duration: trackInfo.duration ? Math.floor(trackInfo.duration) : undefined,
          },
        ];
      }
      const results = await this.ytDlpService.searchYoutube(query, 20);
      return results.map((info) => ({
        type: 'track' as const,
        provider: 'youtube' as const,
        title: info.title ?? 'Unknown Title',
        artist: info.artist ?? info.uploader ?? info.channel,
        album: info.album,
        thumbnail: info.thumbnail,
        externalUrl: info.webpage_url,
        duration: info.duration ? Math.floor(info.duration) : undefined,
      }));
    } catch (error) {
      console.error(`Error searching YouTube tracks: ${error}`);
      return [];
    }
  }

  private async searchAlbums(query: string, _provider: YoutubeTrackProvider): Promise<AlbumSearchResult[]> {
    try {
      if (isYoutubeUrl(query) || isYoutubePlaylistUrl(query)) {
        if (!isYoutubePlaylistUrl(query)) {
          const trackInfo = await this.ytDlpService.extractTrackInfo(query);
          if (trackInfo?.chapters?.length) {
            return [
              {
                type: 'album',
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
      const results = await this.ytDlpService.searchYoutubeAlbums(query, 20);
      return results.map((info) => ({
        type: 'album' as const,
        provider: 'youtube' as const,
        name: info.title ?? 'Unknown Album',
        artist: info.artist ?? info.uploader ?? info.channel,
        coverUrl: info.thumbnail,
        externalUrl: info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`,
        trackCount: undefined,
      }));
    } catch (error) {
      console.error(`Error searching YouTube albums: ${error}`);
      return [];
    }
  }

  private async searchArtists(query: string, _provider: YoutubeTrackProvider): Promise<ArtistSearchResult[]> {
    try {
      const results = await this.ytDlpService.searchYoutubeArtists(query, 20);
      return results.map((info) => ({
        type: 'artist' as const,
        provider: 'youtube' as const,
        name: (info.channel || info.uploader || info.title)?.replace(' - Topic', '') ?? 'Unknown Artist',
        imageUrl: info.thumbnail,
        externalUrl: info.channel_url || info.uploader_url || info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`,
      }));
    } catch (error) {
      console.error(`Error searching YouTube artists: ${error}`);
      return [];
    }
  }

  private async searchPlaylists(query: string, _provider: YoutubeTrackProvider): Promise<PlaylistSearchResult[]> {
    try {
      const results = await this.ytDlpService.searchYoutubePlaylists(query, 20);
      return results.map((info) => ({
        type: 'playlist' as const,
        provider: 'youtube' as const,
        name: info.title ?? 'Unknown Playlist',
        description: info.description,
        coverUrl: info.thumbnail,
        externalUrl: info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`,
        trackCount: info.playlist_count,
        owner: info.uploader ?? info.channel,
      }));
    } catch (error) {
      console.error(`Error searching YouTube playlists: ${error}`);
      return [];
    }
  }

  async getTracks(url: string, provider: YoutubeTrackProvider): Promise<PluginImportTrack[]> {
    try {
      const trackInfo = await this.ytDlpService.extractTrackInfo(url);
      if (!trackInfo) throw new Error('Failed to extract track info from URL');
      return this.buildImportTracksFromInfo(trackInfo, provider);
    } catch (error) {
      console.error(`Error getting tracks from URL ${url}: ${error}`);
      throw error;
    }
  }

  async getAlbumTracks(url: string, provider: YoutubeTrackProvider): Promise<PluginImportTrack[]> {
    try {
      if (url.includes('playlist') || url.includes('list=')) {
        return this.getPlaylistTracks(url, provider);
      }
      const trackInfo = await this.ytDlpService.extractTrackInfo(url);
      if (!trackInfo) throw new Error('Failed to extract album info from URL');
      if (trackInfo.chapters?.length && provider.config.splitChapters) {
        return this.buildImportTracksFromInfo(trackInfo, provider);
      }
      throw new Error('URL is not an album (no playlist or chapters found)');
    } catch (error) {
      console.error(`Error getting album tracks from URL ${url}: ${error}`);
      throw error;
    }
  }

  async getArtistTracks(url: string, provider: YoutubeTrackProvider): Promise<PluginImportTrack[]> {
    try {
      const channelTracks = await this.ytDlpService.extractChannelTracks(url, 200);
      const all: PluginImportTrack[] = [];
      for (const info of channelTracks) {
        try {
          const fullInfo = await this.ytDlpService.extractTrackInfo(info.webpage_url);
          if (fullInfo) {
            all.push(...this.buildImportTracksFromInfo(fullInfo, provider));
          }
        } catch (error) {
          console.error(`Error processing track ${info.webpage_url}: ${error}`);
        }
      }
      return all;
    } catch (error) {
      console.error(`Error getting artist tracks from URL ${url}: ${error}`);
      throw error;
    }
  }

  async getPlaylistTracks(url: string, provider: YoutubeTrackProvider): Promise<PluginImportTrack[]> {
    try {
      const playlistTracks = await this.ytDlpService.extractPlaylistTracks(url);
      const all: PluginImportTrack[] = [];
      for (const info of playlistTracks) {
        try {
          const fullInfo = await this.ytDlpService.extractTrackInfo(info.webpage_url);
          if (fullInfo) {
            all.push(...this.buildImportTracksFromInfo(fullInfo, provider));
          }
        } catch (error) {
          console.error(`Error processing track ${info.webpage_url}: ${error}`);
        }
      }
      return all;
    } catch (error) {
      console.error(`Error getting playlist tracks from URL ${url}: ${error}`);
      throw error;
    }
  }

  private buildImportTracksFromInfo(trackInfo: YtDlpTrackInfo, provider: YoutubeTrackProvider): PluginImportTrack[] {
    const artistName = trackInfo.artist ?? trackInfo.uploader ?? trackInfo.channel ?? 'Unknown Artist';
    const albumName = trackInfo.album ?? `${trackInfo.channel ?? trackInfo.uploader} - YouTube`;
    const baseMetadata: TrackMetadata = {
      year: trackInfo.upload_date ? Number.parseInt(trackInfo.upload_date.slice(0, 4), 10) : undefined,
      bitrate: trackInfo.tbr,
      format: trackInfo.ext,
    };

    if (provider.config.splitChapters && trackInfo.chapters && trackInfo.chapters.length > 0) {
      const cleanTitle = (title: string) => {
        const trim = (s: string) => s.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');
        let t = trim(title);
        const m = t.match(/^(\d+)[\s\u3000.]+(.+)$/);
        if (m?.[2]) t = trim(m[2]);
        return t;
      };

      return trackInfo.chapters
        .filter((ch): ch is NonNullable<typeof ch> => !!ch)
        .map((chapter) => ({
          title: cleanTitle(chapter.title),
          duration: Math.floor(chapter.end_time - chapter.start_time),
          sourceUrl: trackInfo.webpage_url,
          artistName,
          albumName: trackInfo.title ?? albumName,
          coverUrl: trackInfo.thumbnail,
          metadata: {
            ...baseMetadata,
            startTime: chapter.start_time,
            endTime: chapter.end_time,
          },
        }));
    }

    return [
      {
        title: trackInfo.title,
        duration: Math.floor(trackInfo.duration),
        sourceUrl: trackInfo.webpage_url,
        artistName,
        albumName,
        coverUrl: trackInfo.thumbnail,
        metadata: {
          ...baseMetadata,
          chapters: trackInfo.chapters?.map(
            (ch) =>
              ({
                title: ch.title,
                startTime: ch.start_time,
                endTime: ch.end_time,
              }) as { title: string; startTime: number; endTime: number },
          ),
        },
      },
    ];
  }
}
