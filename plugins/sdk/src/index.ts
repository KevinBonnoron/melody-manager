export { type CacheEntry, CacheService, type CacheServiceOptions } from './cache.service';
export { deleteCookiesFile, generateCookiesFile, parseCookies } from './cookies.util';
export { ProviderAuthError, type ProviderAuthErrorCode } from './errors';
export { ffmpeg } from './ffmpeg';
export type { ILogger } from './logger';
export { createDefaultLogger } from './logger';
export type { ConfigSchemaItem, PluginManifest } from './manifest.types';
export type {
  DevicePlugin,
  DeviceProvider,
  DownloadedTrack,
  DownloadProvider,
  ImportProvider,
  PlayOptions,
  PluginCapabilities,
  PluginImportTrack,
  PluginStreamDeps,
  ResolvedStream,
  SearchProvider,
  SourcePlugin,
  StreamResolver,
  WatchEvent,
  WatchEventHandler,
  WatchProvider,
} from './plugin.types';
export { TranscodeService } from './transcode.service';
export {
  type StreamInfo,
  type YtDlpChannelInfo,
  type YtDlpChapter,
  type YtDlpComment,
  YtDlpService,
  type YtDlpTrackInfo,
} from './yt-dlp.util';
