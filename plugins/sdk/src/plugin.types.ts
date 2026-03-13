import type { Device, SearchResult, SearchType, TrackMetadata, TrackProvider } from '@melody-manager/shared';
import type { ILogger } from './logger';

export type ResolvedStream = { type: 'url'; url: string; download?: () => Promise<string> } | { type: 'file'; path: string };

export interface StreamResolver {
  resolve(sourceUrl: string): Promise<ResolvedStream>;
}

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

/** Info about a downloaded track file */
export interface DownloadedTrack {
  sourceUrl: string;
  startTime?: number;
  localPath: string;
}

export interface DownloadProvider {
  downloadAlbumTracks(tracks: { sourceUrl: string; title: string; trackNumber: number; startTime?: number; endTime?: number; albumName: string; artistName: string }[], provider: TrackProvider): Promise<DownloadedTrack[]>;
}

export interface PluginStreamDeps {
  logger: ILogger;
}

export interface PlayOptions {
  trackUrl: string;
  mimeType: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
}

export interface DeviceProvider {
  discoverDevices(): Promise<Device[]>;
  getKnownDevices(): Device[];
  play(device: Device, options?: PlayOptions): Promise<void>;
  pause(device: Device): Promise<void>;
  stop(device: Device): Promise<void>;
  next(device: Device): Promise<void>;
  previous(device: Device): Promise<void>;
  seek(device: Device, position: number): Promise<void>;
  setVolume(device: Device, volume: number): Promise<void>;
  getVolume(device: Device): Promise<number>;
  getCurrentState(device: Device): Promise<string>;
  // biome-ignore lint/suspicious/noExplicitAny: Track info structure varies by device type
  getCurrentTrack(device: Device): Promise<any>;
  addToQueue(device: Device, options: PlayOptions): Promise<void>;
  clearQueue(device: Device): Promise<void>;
}

/** Events emitted by a WatchProvider to signal changes. */
export type WatchEvent = { type: 'sync'; tracks: PluginImportTrack[] } | { type: 'added'; tracks: PluginImportTrack[] } | { type: 'removed'; sourceUrls: string[] };

export type WatchEventHandler = (event: WatchEvent) => void;

/** Plugins that watch a directory or external source for changes. */
export interface WatchProvider {
  watch(provider: TrackProvider, onChange: WatchEventHandler): void;
  unwatch(): void;
}

export interface PluginCapabilities {
  search?: SearchType[];
  stream?: boolean;
  import?: SearchType[];
}

export interface SourcePlugin {
  readonly id: string;
  readonly name: string;
  readonly capabilities?: PluginCapabilities;
  readonly search?: SearchProvider;
  readonly stream?: StreamResolver;
  readonly import?: ImportProvider;
  readonly download?: DownloadProvider;
}

export interface DevicePlugin {
  readonly id: string;
  readonly name: string;
  readonly device: DeviceProvider;
}
