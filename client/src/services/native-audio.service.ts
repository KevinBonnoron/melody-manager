import { MediaSession } from '@jofr/capacitor-media-session';

export interface NativeAudioMetadata {
  title: string;
  artist: string;
  album: string;
  artwork?: string;
  duration?: number;
}

export interface NativeAudioCallbacks {
  onPlay?: () => void;
  onPause?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onSeek?: (time: number) => void;
}

class NativeAudioService {
  private callbacks: NativeAudioCallbacks = {};
  private initialized = false;

  async initialize(callbacks: NativeAudioCallbacks) {
    if (this.initialized) return;

    this.callbacks = callbacks;

    await MediaSession.setActionHandler({ action: 'play' }, () => {
      this.callbacks.onPlay?.();
    });

    await MediaSession.setActionHandler({ action: 'pause' }, () => {
      this.callbacks.onPause?.();
    });

    await MediaSession.setActionHandler({ action: 'nexttrack' }, () => {
      this.callbacks.onNext?.();
    });

    await MediaSession.setActionHandler({ action: 'previoustrack' }, () => {
      this.callbacks.onPrevious?.();
    });

    await MediaSession.setActionHandler({ action: 'seekto' }, (details) => {
      if (details.seekTime !== undefined && details.seekTime !== null) {
        this.callbacks.onSeek?.(details.seekTime);
      }
    });

    this.initialized = true;
  }

  async setMetadata(metadata: NativeAudioMetadata) {
    const artworkArray = metadata.artwork
      ? [
          {
            src: metadata.artwork,
            sizes: '512x512',
            type: 'image/jpeg',
          },
        ]
      : [];

    await MediaSession.setMetadata({
      album: metadata.album,
      artist: metadata.artist,
      artwork: artworkArray,
      title: metadata.title,
    });
  }

  async setPlaybackState(state: 'playing' | 'paused' | 'none') {
    await MediaSession.setPlaybackState({ playbackState: state });
  }

  async setPosition(position: number, duration: number, playbackRate = 1.0) {
    await MediaSession.setPositionState({
      position,
      duration,
      playbackRate,
    });
  }

  async destroy() {
    if (!this.initialized) return;

    await MediaSession.setActionHandler({ action: 'play' }, null);
    await MediaSession.setActionHandler({ action: 'pause' }, null);
    await MediaSession.setActionHandler({ action: 'nexttrack' }, null);
    await MediaSession.setActionHandler({ action: 'previoustrack' }, null);
    await MediaSession.setActionHandler({ action: 'seekto' }, null);

    this.initialized = false;
    this.callbacks = {};
  }
}

export const nativeAudioService = new NativeAudioService();
