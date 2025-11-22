import type { SearchResult, SearchType, TrackMetadata, TrackProvider, TrackProviderType, TranscodeFormat } from '@melody-manager/shared';
import type { Context } from 'hono';
import type { CacheService } from './cache.service';
import type { TranscodeService } from './transcode.service';
import type { YtDlpService } from './yt-dlp.util';

export interface StreamOptions {
  sourceUrl: string;
  trackId?: string;
  transcodeFormat?: TranscodeFormat;
  startTime?: number;
  endTime?: number;
  cookies?: string;
}

export type StreamProvider = (c: Context, options: StreamOptions) => Promise<Response>;

export interface SearchProvider {
  search(query: string, type: SearchType, provider: TrackProvider): Promise<SearchResult[]>;
}

/** Track data returned by a plugin for import. Server persists these to the DB. */
export interface PluginImportTrack {
  title: string;
  duration: number;
  sourceUrl: string;
  artistName: string;
  albumName: string;
  coverUrl?: string;
  metadata?: TrackMetadata;
  genreNames?: string[];
}

export interface ImportProvider {
  getTracks(url: string, provider: TrackProvider): Promise<PluginImportTrack[]>;
  getAlbumTracks?(url: string, provider: TrackProvider): Promise<PluginImportTrack[]>;
  getArtistTracks?(url: string, provider: TrackProvider): Promise<PluginImportTrack[]>;
  getPlaylistTracks?(url: string, provider: TrackProvider): Promise<PluginImportTrack[]>;
}

export interface PluginStreamDeps {
  ffmpeg: typeof import('./ffmpeg').ffmpeg;
  cacheService: CacheService;
  transcodeService: TranscodeService;
  ytDlpService: YtDlpService;
}

export interface PluginCapabilities {
  search?: SearchType[];
  stream?: boolean;
  import?: SearchType[];
}

export interface MelodyPlugin {
  readonly id: TrackProviderType;
  readonly name: string;
  readonly capabilities?: PluginCapabilities;
  readonly search?: SearchProvider;
  readonly stream?: StreamProvider;
  readonly import?: ImportProvider;
}
