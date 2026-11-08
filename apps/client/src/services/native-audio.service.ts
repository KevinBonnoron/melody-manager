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
  private initPromise: Promise<void> | null = null;
  // Bumped on every initialize. A destroy requested by an older owner waits
  // its turn and then checks the generation: a remount that re-initialized
  // while the teardown was pending owns the handlers now, and tearing them
  // down would leave its lock screen without controls.
  private generation = 0;

  public async initialize(callbacks: NativeAudioCallbacks) {
    this.generation++;
    this.callbacks = callbacks;
    if (this.initPromise) {
      await this.initPromise;
      // The handlers are registered once and shared by every mount; only the
      // callbacks belonged to this call, and they are already stored.
      return;
    }

    this.initPromise = (async () => {
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
    })();

    await this.initPromise;
  }

  public async setMetadata(metadata: NativeAudioMetadata) {
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

  public async setPlaybackState(state: 'playing' | 'paused' | 'none') {
    await MediaSession.setPlaybackState({ playbackState: state });
  }

  public async setPosition(position: number, duration: number, playbackRate = 1.0) {
    if (!Number.isFinite(position) || position < 0) {
      return;
    }

    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }

    if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
      playbackRate = 1.0;
    }

    await MediaSession.setPositionState({
      position,
      duration,
      playbackRate,
    });
  }

  public async destroy() {
    const generation = this.generation;
    if (this.initPromise) {
      await this.initPromise;
    }
    if (!this.initialized || generation !== this.generation) {
      // Nothing to tear down, or a newer mount took over while this teardown
      // was waiting: its callbacks are the live ones and the handlers must
      // survive for it.
      return;
    }

    // Clearing the state first stops the foreground service; removing the
    // handlers first would leave Android thinking playback goes on.
    await MediaSession.setPlaybackState({ playbackState: 'none' });

    await MediaSession.setActionHandler({ action: 'play' }, null);
    await MediaSession.setActionHandler({ action: 'pause' }, null);
    await MediaSession.setActionHandler({ action: 'nexttrack' }, null);
    await MediaSession.setActionHandler({ action: 'previoustrack' }, null);
    await MediaSession.setActionHandler({ action: 'seekto' }, null);

    this.initialized = false;
    this.initPromise = null;
    this.callbacks = {};
  }
}

export const nativeAudioService = new NativeAudioService();
