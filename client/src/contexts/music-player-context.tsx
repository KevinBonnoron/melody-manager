import { Capacitor } from '@capacitor/core';
import type { Device, PlayerState, Track, TrackPlay } from '@melody-manager/shared';
import { useLiveQuery } from '@tanstack/react-db';
import { useAuth } from 'pocketbase-react-hooks';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { trackPlayCollection } from '@/collections/track-play.collection';
import i18n from '@/i18n';
import { config } from '@/lib/config';
import { getAlbumCoverUrl } from '@/lib/cover-url';
import { deviceClient } from '../clients/device.client';
import { nativeAudioService } from '../services';

export type AudioFormat = 'source' | 'mp3' | 'flac' | 'wav' | 'aac';

interface MusicPlayerContextValue {
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  currentTime: number;
  queue: Track[];
  repeatMode: 'none' | 'all' | 'one';
  shuffle: boolean;

  activeDevice: Device | null;
  audioFormat: AudioFormat;

  playTrack: (track: Track) => void;
  playTrackWithContext: (track: Track, contextTracks: Track[]) => void;
  togglePlayPause: () => void;
  playNext: () => void;
  playPrevious: () => void;

  seek: (time: number) => void;
  setVolume: (volume: number) => void;

  toggleRepeat: () => void;
  toggleShuffle: () => void;

  setQueue: (tracks: Track[]) => void;
  addToQueue: (tracks: Track[]) => void;
  removeFromQueue: (trackId: string) => void;
  clearQueue: () => void;
  switchDevice: (device: Device | null) => void;
  setAudioFormat: (format: AudioFormat) => void;

  audioElement: HTMLAudioElement | null;
}

const MusicPlayerContext = createContext<MusicPlayerContextValue | undefined>(undefined);
interface MusicPlayerProviderProps {
  children: ReactNode;
}

export function MusicPlayerProvider({ children }: MusicPlayerProviderProps) {
  const { user } = useAuth();
  const { data: trackPlays = [] } = useLiveQuery((q) => q.from({ trackPlays: trackPlayCollection }));
  const trackPlaysRef = useRef<TrackPlay[]>([]);
  trackPlaysRef.current = trackPlays as TrackPlay[];
  const userIdRef = useRef<string | undefined>(undefined);
  userIdRef.current = user?.id;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrackIdRef = useRef<string | null>(null);
  const endedHandledForTrackIdRef = useRef<string | null>(null);
  const currentPlayIdRef = useRef<string | null>(null);
  const playCompletedForTrackIdRef = useRef<string | null>(null);
  const listenedTimeRef = useRef(0);
  const lastTimeUpdateRef = useRef(0);
  const [activeDevice, setActiveDevice] = useState<Device | null>(null);
  const [audioFormat, setAudioFormat] = useState<AudioFormat>('source');
  const [isLoading, setIsLoading] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>({
    currentTrack: null,
    isPlaying: false,
    volume: 1.0,
    currentTime: 0,
    queue: [],
    repeatMode: 'none',
    shuffle: false,
  });

  const isNativePlatform = Capacitor.isNativePlatform();
  currentTrackIdRef.current = playerState.currentTrack?.id ?? null;

  useEffect(() => {
    endedHandledForTrackIdRef.current = null;
  }, []);

  const playTrack = useCallback(
    async (track: Track) => {
      endedHandledForTrackIdRef.current = null;
      playCompletedForTrackIdRef.current = null;
      listenedTimeRef.current = 0;
      lastTimeUpdateRef.current = 0;

      // Insert play record immediately (completed: false) for history
      // Guard against double calls (React strict mode / setState double-invoke)
      const userId = userIdRef.current;
      const now = Date.now();
      const lastPlayId = currentPlayIdRef.current;
      const isDuplicate = lastPlayId?.includes(`-${track.id}-`) && now - Number(lastPlayId.split('-').pop()) < 1000;
      if (userId && !isDuplicate) {
        const playId = `tmp-${userId}-${track.id}-${now}`;
        currentPlayIdRef.current = playId;
        trackPlayCollection.insert({ id: playId, user: userId, track: track.id, completed: false } as TrackPlay);
      }

      setPlayerState((prev) => ({
        ...prev,
        currentTrack: track,
        isPlaying: true,
        currentTime: 0,
      }));

      if (activeDevice && activeDevice.type === 'sonos') {
        try {
          setIsLoading(true);
          await deviceClient.play(activeDevice.id, track.id);
          setIsLoading(false);
        } catch (error) {
          console.error('Sonos playback failed:', error);
          toast.error(i18n.t('MusicPlayer.playbackError', { title: track.title }));
          setPlayerState((prev) => ({ ...prev, isPlaying: false }));
          setIsLoading(false);
        }

        return;
      }

      if (!audioRef.current) {
        return;
      }

      setIsLoading(true);
      const transcodeParam = audioFormat !== 'source' ? `?transcode=${audioFormat}` : '';
      const audioSrc = `${config.server.url}/tracks/stream/${track.id}${transcodeParam}`;
      audioRef.current.src = audioSrc;

      audioRef.current.play().catch((error) => {
        if (error.name === 'AbortError') {
          return;
        }

        console.error('Playback failed:', error);
        toast.error(i18n.t('MusicPlayer.playbackError', { title: track.title }));
        setPlayerState((prev) => ({ ...prev, isPlaying: false }));
        setIsLoading(false);
      });
    },
    [activeDevice, audioFormat],
  );

  const playTrackRef = useRef(playTrack);
  playTrackRef.current = playTrack;

  // Sync volume to audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = playerState.volume;
    }
  }, [playerState.volume]);

  // Initialize audio element — intentionally runs once, initial volume read at mount only
  // biome-ignore lint/correctness/useExhaustiveDependencies: audio element must only be created once
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.volume = playerState.volume;

    const audio = audioRef.current;
    setAudioElement(audio);

    const handleTimeUpdate = () => {
      if (audio) {
        const currentTime = audio.currentTime;
        setPlayerState((prev) => ({
          ...prev,
          currentTime,
        }));

        // Accumulate actual listened time (only small forward deltas from normal playback)
        const delta = currentTime - lastTimeUpdateRef.current;
        if (delta > 0 && delta < 2) {
          listenedTimeRef.current += delta;
        }

        lastTimeUpdateRef.current = currentTime;

        const trackId = currentTrackIdRef.current;
        const playId = currentPlayIdRef.current;
        if (trackId && playId && trackId !== playCompletedForTrackIdRef.current && audio.duration > 0 && listenedTimeRef.current >= audio.duration * 0.9) {
          // The tmp- key may have been replaced by a real server ID after sync
          const play = trackPlaysRef.current.find((p) => p.id === playId) ?? trackPlaysRef.current.find((p) => p.track === trackId && p.user === userIdRef.current && !p.completed);
          if (play) {
            trackPlayCollection.update(play.id, (draft) => {
              draft.completed = true;
            });
            playCompletedForTrackIdRef.current = trackId;
          }
        }
      }
    };

    const handleEnded = () => {
      const trackId = currentTrackIdRef.current;
      if (trackId === null || trackId === endedHandledForTrackIdRef.current) {
        return;
      }

      endedHandledForTrackIdRef.current = trackId;

      setTimeout(() => {
        setPlayerState((prev) => {
          if (prev.repeatMode === 'one') {
            audio.currentTime = 0;
            audio.play();
            return prev;
          } else if (prev.shuffle && prev.queue.length > 1) {
            const otherTracks = prev.queue.filter((t) => t.id !== prev.currentTrack?.id);
            if (otherTracks.length > 0) {
              setTimeout(() => playTrackRef.current(otherTracks[Math.floor(Math.random() * otherTracks.length)]), 0);
            }

            return prev;
          } else if (prev.repeatMode === 'all') {
            const currentIndex = prev.queue.findIndex((t) => t.id === prev.currentTrack?.id);
            if (currentIndex >= 0 && currentIndex < prev.queue.length - 1) {
              setTimeout(() => playTrackRef.current(prev.queue[currentIndex + 1]), 0);
            } else if (prev.queue.length > 0) {
              setTimeout(() => playTrackRef.current(prev.queue[0]), 0);
            }
          } else if (prev.queue.length > 0) {
            const currentIndex = prev.queue.findIndex((t) => t.id === prev.currentTrack?.id);
            if (currentIndex >= 0 && currentIndex < prev.queue.length - 1) {
              setTimeout(() => playTrackRef.current(prev.queue[currentIndex + 1]), 0);
            } else {
              return { ...prev, currentTrack: null, isPlaying: false };
            }
          } else {
            return { ...prev, currentTrack: null, isPlaying: false };
          }

          return prev;
        });
      }, 0);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    const handleWaiting = () => {
      setIsLoading(true);
    };

    const handlePlaying = () => {
      setIsLoading(false);
      setPlayerState((prev) => ({ ...prev, isPlaying: true }));
    };

    const handlePause = () => {
      setPlayerState((prev) => ({ ...prev, isPlaying: false }));
    };

    const handlePlay = () => {
      setPlayerState((prev) => ({ ...prev, isPlaying: true }));
    };

    const handleError = () => {
      if (currentTrackIdRef.current) {
        setIsLoading(true);
        setPlayerState((prev) => ({ ...prev, isPlaying: false }));
      }
    };

    const handleStalled = () => {
      if (currentTrackIdRef.current) {
        setIsLoading(true);
        setPlayerState((prev) => ({ ...prev, isPlaying: false }));
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('error', handleError);
    audio.addEventListener('stalled', handleStalled);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('stalled', handleStalled);
      audio.pause();
    };
  }, []);

  const pause = useCallback(async () => {
    if (activeDevice?.type === 'sonos') {
      try {
        await deviceClient.pause(activeDevice.id);
        setPlayerState((prev) => ({ ...prev, isPlaying: false }));
      } catch (error) {
        console.error('Sonos pause failed:', error);
        toast.error(i18n.t('MusicPlayer.deviceError'));
      }

      return;
    }

    if (!audioRef.current) {
      return;
    }

    audioRef.current.pause();
  }, [activeDevice]);

  const play = useCallback(async () => {
    if (activeDevice?.type === 'sonos') {
      try {
        await deviceClient.play(activeDevice.id);
        setPlayerState((prev) => ({ ...prev, isPlaying: true }));
      } catch (error) {
        console.error('Sonos play failed:', error);
        toast.error(i18n.t('MusicPlayer.deviceError'));
      }

      return;
    }

    if (!audioRef.current) {
      return;
    }

    audioRef.current.play().catch((error) => {
      if (error.name === 'AbortError') {
        return;
      }

      console.error('Playback failed:', error);
      const title = playerState.currentTrack?.title;
      toast.error(title ? i18n.t('MusicPlayer.playbackError', { title }) : i18n.t('MusicPlayer.playbackErrorGeneric'));
      setPlayerState((prev) => ({ ...prev, isPlaying: false }));
    });
  }, [activeDevice, playerState.currentTrack?.title]);

  const togglePlayPause = useCallback(() => {
    if (playerState.isPlaying) {
      pause();
    } else {
      play();
    }
  }, [playerState.isPlaying, pause, play]);

  const playNext = useCallback(async () => {
    if (activeDevice?.type === 'sonos') {
      try {
        await deviceClient.next(activeDevice.id);
      } catch (error) {
        console.error('Sonos next failed:', error);
        toast.error(i18n.t('MusicPlayer.deviceError'));
      }

      return;
    }

    if (playerState.shuffle && playerState.queue.length > 1) {
      const otherTracks = playerState.queue.filter((t) => t.id !== playerState.currentTrack?.id);
      if (otherTracks.length > 0) {
        playTrack(otherTracks[Math.floor(Math.random() * otherTracks.length)]);
      }

      return;
    }

    const currentIndex = playerState.queue.findIndex((t) => t.id === playerState.currentTrack?.id);
    if (currentIndex === -1 || currentIndex === playerState.queue.length - 1) {
      if (playerState.repeatMode === 'all' && playerState.queue.length > 0) {
        playTrack(playerState.queue[0]);
      }

      return;
    }

    playTrack(playerState.queue[currentIndex + 1]);
  }, [activeDevice, playerState.queue, playerState.currentTrack, playerState.repeatMode, playerState.shuffle, playTrack]);

  const playPrevious = useCallback(async () => {
    if (activeDevice?.type === 'sonos') {
      try {
        await deviceClient.previous(activeDevice.id);
      } catch (error) {
        console.error('Sonos previous failed:', error);
        toast.error(i18n.t('MusicPlayer.deviceError'));
      }

      return;
    }

    if (playerState.shuffle && playerState.queue.length > 1) {
      const otherTracks = playerState.queue.filter((t) => t.id !== playerState.currentTrack?.id);
      if (otherTracks.length > 0) {
        playTrack(otherTracks[Math.floor(Math.random() * otherTracks.length)]);
      }

      return;
    }

    const currentIndex = playerState.queue.findIndex((t) => t.id === playerState.currentTrack?.id);
    if (currentIndex === -1 || currentIndex === 0) {
      if (playerState.repeatMode === 'all' && playerState.queue.length > 0) {
        playTrack(playerState.queue[playerState.queue.length - 1]);
      }

      return;
    }

    playTrack(playerState.queue[currentIndex - 1]);
  }, [activeDevice, playerState.queue, playerState.currentTrack, playerState.repeatMode, playerState.shuffle, playTrack]);

  const seek = useCallback(
    async (time: number) => {
      if (activeDevice?.type === 'sonos') {
        try {
          await deviceClient.seek(activeDevice.id, time);
          setPlayerState((prev) => ({ ...prev, currentTime: time }));
        } catch (error) {
          console.error('Sonos seek failed:', error);
          toast.error(i18n.t('MusicPlayer.deviceError'));
        }

        return;
      }

      if (!audioRef.current) {
        return;
      }

      audioRef.current.currentTime = time;
      setPlayerState((prev) => ({ ...prev, currentTime: time }));
    },
    [activeDevice],
  );

  const setVolume = useCallback(
    async (volume: number) => {
      if (activeDevice?.type === 'sonos') {
        try {
          const volumePercent = Math.round(volume * 100);
          await deviceClient.setVolume(activeDevice.id, volumePercent);
          setPlayerState((prev) => ({ ...prev, volume }));
        } catch (error) {
          console.error('Sonos setVolume failed:', error);
          toast.error(i18n.t('MusicPlayer.deviceError'));
        }

        return;
      }

      if (!audioRef.current) {
        return;
      }

      audioRef.current.volume = volume;
      setPlayerState((prev) => ({ ...prev, volume }));
    },
    [activeDevice],
  );

  const toggleRepeat = () => {
    setPlayerState((prev) => ({
      ...prev,
      repeatMode: prev.repeatMode === 'none' ? 'one' : prev.repeatMode === 'one' ? 'all' : 'none',
    }));
  };

  const toggleShuffle = useCallback(() => {
    setPlayerState((prev) => ({ ...prev, shuffle: !prev.shuffle }));
  }, []);

  const setQueue = useCallback((tracks: Track[]) => {
    setPlayerState((prev) => ({ ...prev, queue: tracks }));
  }, []);

  const playTrackWithContext = useCallback(
    (track: Track, contextTracks: Track[]) => {
      if (contextTracks.length === 0) {
        playTrack(track);
        return;
      }

      const trackIndex = contextTracks.findIndex((t) => t.id === track.id);
      if (trackIndex === -1) {
        playTrack(track);
        return;
      }

      setQueue(contextTracks);
      playTrack(track);
    },
    [playTrack, setQueue],
  );

  const addToQueue = useCallback((tracks: Track[]) => {
    setPlayerState((prev) => ({ ...prev, queue: [...prev.queue, ...tracks] }));
  }, []);

  const removeFromQueue = useCallback(
    (trackId: string) => {
      setPlayerState((prev) => {
        const newQueue = prev.queue.filter((t) => t.id !== trackId);
        if (prev.currentTrack?.id === trackId && newQueue.length > 0) {
          const currentIndex = prev.queue.findIndex((t) => t.id === trackId);
          const nextTrack = newQueue[Math.min(currentIndex, newQueue.length - 1)];
          setTimeout(() => playTrack(nextTrack), 0);
        }

        return { ...prev, queue: newQueue };
      });
    },
    [playTrack],
  );

  const clearQueue = useCallback(() => {
    setPlayerState((prev) => ({ ...prev, queue: [] }));
  }, []);

  const switchDevice = useCallback(
    async (device: Device | null) => {
      setActiveDevice(device);

      if (playerState.isPlaying && audioRef.current) {
        audioRef.current.pause();
        setPlayerState((prev) => ({ ...prev, isPlaying: false }));
      }

      if (device?.type === 'sonos') {
        try {
          const response = await deviceClient.getState(device.id);
          if (response.success && response.data.volume !== undefined) {
            setPlayerState((prev) => ({ ...prev, volume: response.data.volume / 100 }));
          }
        } catch (error) {
          console.error('Failed to get device state:', error);
          toast.error(i18n.t('MusicPlayer.deviceError'));
        }
      }
    },
    [playerState.isPlaying],
  );

  // Media Session API for background playback
  useEffect(() => {
    if (!playerState.currentTrack) {
      return;
    }

    const track = playerState.currentTrack;
    if (isNativePlatform) {
      nativeAudioService.initialize({
        onPlay: () => play(),
        onPause: () => pause(),
        onNext: () => playNext(),
        onPrevious: () => playPrevious(),
        onSeek: (time) => seek(time),
      });

      nativeAudioService.setMetadata({
        title: track.title,
        artist: track.expand?.artists?.map((a) => a.name).join(', ') || 'Unknown Artist',
        album: track.expand?.album?.name || 'Unknown Album',
        artwork: track.expand?.album ? getAlbumCoverUrl(track.expand.album) : undefined,
        duration: track.duration,
      });

      return () => {
        nativeAudioService.destroy();
      };
    }

    if (!('mediaSession' in navigator)) {
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.expand?.artists?.map((a) => a.name).join(', ') || 'Unknown Artist',
      album: track.expand?.album?.name || 'Unknown Album',
      artwork: (() => {
        const url = track.expand?.album ? getAlbumCoverUrl(track.expand.album) : undefined;
        return url ? [{ src: url, sizes: '512x512', type: 'image/jpeg' }] : [];
      })(),
    });

    navigator.mediaSession.setActionHandler('play', () => {
      play();
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      pause();
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      playNext();
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      playPrevious();
    });

    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        seek(details.seekTime);
      }
    });

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('seekto', null);
    };
  }, [isNativePlatform, playerState.currentTrack, play, pause, playNext, playPrevious, seek]);

  // Update Media Session playback state
  useEffect(() => {
    if (isNativePlatform) {
      nativeAudioService.setPlaybackState(playerState.isPlaying ? 'playing' : 'paused');
      return;
    }

    if (!('mediaSession' in navigator)) {
      return;
    }

    navigator.mediaSession.playbackState = playerState.isPlaying ? 'playing' : 'paused';
  }, [isNativePlatform, playerState.isPlaying]);

  // Update position state
  useEffect(() => {
    if (!playerState.currentTrack) {
      return;
    }

    if (isNativePlatform) {
      nativeAudioService.setPosition(playerState.currentTime, playerState.currentTrack.duration || 0, playerState.isPlaying ? 1.0 : 0.0);
    }
  }, [isNativePlatform, playerState.currentTrack, playerState.currentTime, playerState.isPlaying]);

  // Poll device state for Sonos devices
  useEffect(() => {
    if (!activeDevice || activeDevice.type !== 'sonos' || !playerState.isPlaying) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const response = await deviceClient.getState(activeDevice.id);
        if (!response.success) {
          return;
        }

        const { state, track, volume } = response.data;
        const isPlaying = state === 'PLAYING';
        let currentTime = 0;
        if (track && typeof track === 'object' && 'RelTime' in track && typeof track.RelTime === 'string') {
          const timeParts = track.RelTime.split(':');
          if (timeParts.length === 3) {
            const [hours, minutes, seconds] = timeParts.map(Number);
            currentTime = hours * 3600 + minutes * 60 + seconds;
          }
        }

        setPlayerState((prev) => ({
          ...prev,
          isPlaying,
          currentTime,
          volume: volume !== undefined ? volume / 100 : prev.volume,
        }));
      } catch (error) {
        console.error('Failed to poll device state:', error);
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [activeDevice, playerState.isPlaying]);

  const value: MusicPlayerContextValue = {
    currentTrack: playerState.currentTrack,
    isPlaying: playerState.isPlaying,
    isLoading,
    volume: playerState.volume,
    currentTime: playerState.currentTime,
    queue: playerState.queue,
    repeatMode: playerState.repeatMode,
    shuffle: playerState.shuffle,

    activeDevice,
    audioFormat,
    playTrack,
    playTrackWithContext,
    togglePlayPause,
    playNext,
    playPrevious,
    seek,
    setVolume,
    toggleRepeat,
    toggleShuffle,
    setQueue,
    addToQueue,
    removeFromQueue,
    clearQueue,
    switchDevice,
    setAudioFormat,
    audioElement,
  };

  return <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>;
}

export function useMusicPlayer() {
  const context = useContext(MusicPlayerContext);
  if (context === undefined) {
    throw new Error('useMusicPlayer must be used within a MusicPlayerProvider');
  }

  return context;
}
