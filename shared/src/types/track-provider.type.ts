import type { RecordModel } from 'pocketbase';

// Tracks
interface BaseTrackProvider extends RecordModel {
  category: 'track';
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface LocalTrackProvider extends BaseTrackProvider {
  type: 'local';
  config: {
    path: string;
  };
}

export interface YoutubeTrackProvider extends BaseTrackProvider {
  type: 'youtube';
  config: {
    splitChapters?: boolean; // If true, videos with chapters will be split into separate tracks in an album
  };
}

export interface SpotifyTrackProvider extends BaseTrackProvider {
  type: 'spotify';
  config: {
    clientId: string; // Spotify application client ID
    clientSecret: string; // Spotify application client secret
  };
}

export interface SoundcloudTrackProvider extends BaseTrackProvider {
  type: 'soundcloud';
  config: Record<string, never>; // No configuration needed, uses yt-dlp for search and extraction
}

export interface BandcampTrackProvider extends BaseTrackProvider {
  type: 'bandcamp';
  config: {
    cookies: string; // Cookies from browser (use "Get cookies.txt LOCALLY" extension, Netscape format)
  };
}

export type TrackProvider = LocalTrackProvider | YoutubeTrackProvider | SpotifyTrackProvider | SoundcloudTrackProvider | BandcampTrackProvider;
export type TrackProviderType = TrackProvider['type'];

// Devices
interface BaseDeviceProvider extends RecordModel {
  category: 'device';
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface SonosDeviceProvider extends BaseDeviceProvider {
  type: 'sonos';
  config: {
    ipAddress: string;
  };
}

export type DeviceProvider = SonosDeviceProvider;
export type DeviceProviderType = DeviceProvider['type'];

// Combined
export type Provider = TrackProvider | DeviceProvider;
export type ProviderType = Provider['type'];
