import type { AlbumResolver, ArtistResolver, Device, PlaylistResolver, ResolvedTrack, SearchResult, SearchType, TrackProvider, TrackResolver } from '@melody-manager/shared';

export type ResolvedStream = { type: 'url'; url: string; download?: () => Promise<string> } | { type: 'file'; path: string };

export interface StreamResolver {
  resolve(sourceUrl: string): Promise<ResolvedStream>;
}

export interface SearchProvider {
  search(query: string, type: SearchType, provider: TrackProvider): Promise<SearchResult[]>;
}

export interface DownloadedTrack {
  sourceUrl: string;
  startTime?: number;
  localPath: string;
}

export interface DownloadProvider {
  downloadAlbumTracks(tracks: { sourceUrl: string; title: string; trackNumber: number; startTime?: number; endTime?: number; albumName: string; artistName: string }[], provider: TrackProvider): Promise<DownloadedTrack[]>;
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

export type WatchEvent = { type: 'sync'; tracks: ResolvedTrack[] } | { type: 'added'; tracks: ResolvedTrack[] } | { type: 'removed'; sourceUrls: string[] };

export type WatchEventHandler = (event: WatchEvent) => void;

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
  readonly trackResolver?: TrackResolver;
  readonly albumResolver?: AlbumResolver;
  readonly artistResolver?: ArtistResolver;
  readonly playlistResolver?: PlaylistResolver;
  readonly download?: DownloadProvider;
}

export interface DevicePlugin {
  readonly id: string;
  readonly name: string;
  readonly device: DeviceProvider;
}

export interface StreamingClient {
  getArtistImage(query: string): Promise<string | null>;
}
