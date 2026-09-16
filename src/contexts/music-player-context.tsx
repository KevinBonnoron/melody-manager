import { Capacitor } from '@capacitor/core';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useAuth } from 'pocketbase-react-hooks';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { trackCollection } from '@/collections/track.collection';
import { trackPlayCollection } from '@/collections/track-play.collection';
import { artistNames, useAlbumsById, useArtistsById } from '@/hooks/use-library-index';
import { useReportedPosition } from '@/hooks/use-reported-position';
import i18n from '@/i18n';
import { config } from '@/lib/config';
import { getAlbumCoverUrl } from '@/lib/cover-url';
import { getDevices, subscribeDevices } from '@/lib/device-presence';
import { getStreamToken } from '@/lib/stream-token';
import { type Device, isNetworkDevice, type NetworkDevice, type PlayerState, type Track, type TrackPlay } from '@/shared';
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

  playTrack: (track: Track, startAt?: number) => void;
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
  playHere: (track: Track, at: number, from: Device) => void;
  setAudioFormat: (format: AudioFormat) => void;

  audioElement: HTMLAudioElement | null;
}

const SEEK_SETTLE_MS = 2000;

const VOLUME_SETTLE_MS = 150;

const VOLUME_KEY = 'melody-manager-volume';

function storedVolume(): number {
  try {
    const raw = Number.parseFloat(localStorage.getItem(VOLUME_KEY) ?? '');
    return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 1;
  } catch {
    return 1;
  }
}
const VOLUME_REPORT_GRACE_MS = 3000;

const SPEAKER_END_TOLERANCE = 3;

const MusicPlayerContext = createContext<MusicPlayerContextValue | undefined>(undefined);
interface MusicPlayerProviderProps {
  children: ReactNode;
}

export function MusicPlayerProvider({ children }: MusicPlayerProviderProps) {
  const { user } = useAuth();
  const { data: trackPlays = [] } = useLiveQuery({ query: (q) => q.from({ trackPlays: trackPlayCollection }) });
  const trackPlaysRef = useRef<TrackPlay[]>([]);
  trackPlaysRef.current = trackPlays as TrackPlay[];
  const userIdRef = useRef<string | undefined>(undefined);
  userIdRef.current = user?.id;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrackIdRef = useRef<string | null>(null);
  const currentTrackRef = useRef<Track | null>(null);
  const isPlayingRef = useRef(false);
  const deviceDecidedRef = useRef(false);
  const positionRef = useRef(0);
  const speakerReachedRef = useRef(0);
  const seekOnLoadRef = useRef<(() => void) | null>(null);
  const endedHandledForTrackIdRef = useRef<string | null>(null);
  const currentPlayIdRef = useRef<string | null>(null);
  const lastPlayRef = useRef<{ trackId: string; at: number } | null>(null);
  const playCompletedForTrackIdRef = useRef<string | null>(null);
  const listenedTimeRef = useRef(0);
  const lastTimeUpdateRef = useRef(0);
  const playRequestRef = useRef(0);
  const speakerQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const seekRequestRef = useRef(0);
  const [activeDevice, setActiveDevice] = useState<Device | null>(null);
  const devices = useSyncExternalStore(subscribeDevices, getDevices);
  const albumsById = useAlbumsById();
  const artistsById = useArtistsById();
  const speaker = activeDevice && isNetworkDevice(activeDevice) ? (devices.find((d): d is NetworkDevice => d.id === activeDevice.id && isNetworkDevice(d)) ?? null) : null;
  const speakerPosition = useReportedPosition(speaker);
  const [audioFormat, setAudioFormat] = useState<AudioFormat>('source');
  const [isLoading, setIsLoading] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>({
    currentTrack: null,
    isPlaying: false,
    localVolume: storedVolume(),
    currentTime: 0,
    queue: [],
    repeatMode: 'none',
    shuffle: false,
  });

  const isNativePlatform = Capacitor.isNativePlatform();
  currentTrackIdRef.current = playerState.currentTrack?.id ?? null;
  currentTrackRef.current = playerState.currentTrack;
  isPlayingRef.current = playerState.isPlaying;
  positionRef.current = playerState.currentTime;

  useEffect(() => {
    endedHandledForTrackIdRef.current = null;
  }, []);

  const retireSpeakerWork = useCallback(() => ++playRequestRef.current, []);

  const resumeHere = useCallback((generation: number, track: Track, at: number) => {
    setTimeout(() => {
      if (generation === playRequestRef.current) {
        playTrackRef.current(track, at);
      }
    }, 0);
  }, []);

  const speakerOp = useCallback(async <T,>(run: () => Promise<T>, handlers: { done?: (value: T) => void; failed?: (error: unknown) => void } = {}) => {
    const playAt = playRequestRef.current;
    const seekAt = seekRequestRef.current;
    const current = () => playAt === playRequestRef.current && seekAt === seekRequestRef.current;

    const queued = speakerQueueRef.current.then(run, run);
    speakerQueueRef.current = queued.catch(() => undefined);

    try {
      const value = await queued;
      if (current()) {
        handlers.done?.(value);
      }
    } catch (error) {
      if (current()) {
        handlers.failed?.(error);
      }
    }
  }, []);

  const playTrack = useCallback(
    async (track: Track, startAt = 0) => {
      deviceDecidedRef.current = true;
      const request = retireSpeakerWork();
      endedHandledForTrackIdRef.current = null;
      playCompletedForTrackIdRef.current = null;
      listenedTimeRef.current = 0;
      lastTimeUpdateRef.current = 0;

      const userId = userIdRef.current;
      const now = Date.now();
      const last = lastPlayRef.current;
      const isDuplicate = last?.trackId === track.id && now - last.at < 1000;
      if (userId && !isDuplicate) {
        const playId = trackPlayCollection.utils.newId();
        currentPlayIdRef.current = playId;
        lastPlayRef.current = { trackId: track.id, at: now };
        trackPlayCollection.insert({ id: playId, user: userId, track: track.id, completed: false } as TrackPlay);
      }

      setPlayerState((prev) => ({
        ...prev,
        currentTrack: track,
        isPlaying: true,
        currentTime: startAt,
      }));

      if (activeDevice && isNetworkDevice(activeDevice)) {
        setIsLoading(true);
        await speakerOp(() => deviceClient.play(activeDevice.id, track.id, Math.round(startAt)), {
          done: () => setIsLoading(false),
          failed: (error) => {
            console.error('Playing to the device failed:', error);
            toast.error(i18n.t('MusicPlayer.playbackError', { title: track.title }));
            setPlayerState((prev) => ({ ...prev, isPlaying: false }));
            setIsLoading(false);
          },
        });

        return;
      }

      if (!audioRef.current) {
        return;
      }

      setIsLoading(true);
      const params = new URLSearchParams();
      if (audioFormat !== 'source') {
        params.set('transcode', audioFormat);
      }
      try {
        params.set('token', await getStreamToken(track.id));
      } catch (error) {
        console.error('Stream token failed:', error);
        if (request !== playRequestRef.current) {
          return;
        }
        toast.error(i18n.t('MusicPlayer.playbackError', { title: track.title }));
        setPlayerState((prev) => ({ ...prev, isPlaying: false }));
        setIsLoading(false);
        return;
      }

      if (request !== playRequestRef.current) {
        return;
      }
      const audio = audioRef.current;
      if (seekOnLoadRef.current) {
        audio.removeEventListener('loadedmetadata', seekOnLoadRef.current);
        seekOnLoadRef.current = null;
      }

      audio.src = `${config.server.url}/tracks/${track.id}/stream?${params.toString()}`;
      if (startAt > 0) {
        const seek = () => {
          audio.currentTime = startAt;
          seekOnLoadRef.current = null;
        };
        seekOnLoadRef.current = seek;
        audio.addEventListener('loadedmetadata', seek, { once: true });
      }

      audioRef.current.play().catch((error) => {
        if (error.name === 'AbortError') {
          return;
        }

        console.error('Playback failed:', error);
        if (request !== playRequestRef.current) {
          return;
        }

        toast.error(i18n.t('MusicPlayer.playbackError', { title: track.title }));
        setPlayerState((prev) => ({ ...prev, isPlaying: false }));
        setIsLoading(false);
      });
    },
    [activeDevice, audioFormat, retireSpeakerWork, speakerOp],
  );

  const playTrackRef = useRef(playTrack);
  playTrackRef.current = playTrack;

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = playerState.localVolume;
    }

    try {
      localStorage.setItem(VOLUME_KEY, String(playerState.localVolume));
    } catch {
      // A browser refusing storage still plays; it just forgets the level.
    }
  }, [playerState.localVolume]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: audio element must only be created once
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.volume = playerState.localVolume;

    const audio = audioRef.current;
    setAudioElement(audio);

    const handleTimeUpdate = () => {
      if (audio) {
        const currentTime = audio.currentTime;
        setPlayerState((prev) => ({
          ...prev,
          currentTime,
        }));

        const delta = currentTime - lastTimeUpdateRef.current;
        if (delta > 0 && delta < 2) {
          listenedTimeRef.current += delta;
        }

        lastTimeUpdateRef.current = currentTime;

        const trackId = currentTrackIdRef.current;
        const playId = currentPlayIdRef.current;
        if (trackId && playId && trackId !== playCompletedForTrackIdRef.current && audio.duration > 0 && listenedTimeRef.current >= audio.duration * 0.9) {
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
    if (activeDevice && isNetworkDevice(activeDevice)) {
      setPlayerState((prev) => ({ ...prev, isPlaying: false }));
      await speakerOp(() => deviceClient.pause(activeDevice.id), {
        failed: (error) => {
          console.error('Pausing the device failed:', error);
          toast.error(i18n.t('MusicPlayer.deviceError'));
          setPlayerState((prev) => ({ ...prev, isPlaying: true }));
        },
      });

      return;
    }

    if (!audioRef.current) {
      return;
    }

    audioRef.current.pause();
  }, [activeDevice, speakerOp]);

  const play = useCallback(async () => {
    if (activeDevice && isNetworkDevice(activeDevice)) {
      const playing = () => setPlayerState((prev) => ({ ...prev, isPlaying: true }));
      const gaveUp = (error: unknown) => {
        console.error('Resuming the device failed:', error);
        toast.error(i18n.t('MusicPlayer.deviceError'));
      };

      await speakerOp(() => deviceClient.play(activeDevice.id), {
        done: playing,
        failed: (error) => {
          const track = currentTrackRef.current;
          if (!track) {
            gaveUp(error);
            return;
          }

          void speakerOp(() => deviceClient.play(activeDevice.id, track.id, Math.round(speakerReachedRef.current)), { done: playing, failed: gaveUp });
        },
      });

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
  }, [activeDevice, playerState.currentTrack?.title, speakerOp]);

  const togglePlayPause = useCallback(() => {
    if (playerState.isPlaying) {
      pause();
    } else {
      play();
    }
  }, [playerState.isPlaying, pause, play]);

  const playNext = useCallback(async () => {
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
  }, [playerState.queue, playerState.currentTrack, playerState.repeatMode, playerState.shuffle, playTrack]);

  const playPrevious = useCallback(async () => {
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
  }, [playerState.queue, playerState.currentTrack, playerState.repeatMode, playerState.shuffle, playTrack]);

  const seekedAtRef = useRef(0);
  const volumeCommandRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeRequestRef = useRef(0);
  const volumeQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const [pendingVolume, setPendingVolume] = useState<number | null>(null);
  const seek = useCallback(
    async (time: number) => {
      if (activeDevice && isNetworkDevice(activeDevice)) {
        seekRequestRef.current++;
        const settledAt = seekedAtRef.current;
        const reached = speakerReachedRef.current;
        seekedAtRef.current = Date.now();
        speakerReachedRef.current = time;
        setPlayerState((prev) => ({ ...prev, currentTime: time }));
        await speakerOp(() => deviceClient.seek(activeDevice.id, time), {
          failed: (error) => {
            console.error('Seeking on the device failed:', error);
            seekedAtRef.current = settledAt;
            speakerReachedRef.current = reached;
            setPlayerState((prev) => ({ ...prev, currentTime: reached }));
            toast.error(i18n.t('MusicPlayer.deviceError'));
          },
        });

        return;
      }

      if (!audioRef.current) {
        return;
      }

      audioRef.current.currentTime = time;
      setPlayerState((prev) => ({ ...prev, currentTime: time }));
    },
    [activeDevice, speakerOp],
  );

  const setVolume = useCallback(
    (volume: number) => {
      if (activeDevice && isNetworkDevice(activeDevice)) {
        const target = activeDevice.id;
        const request = ++volumeRequestRef.current;
        setPendingVolume(volume);
        if (volumeCommandRef.current) {
          clearTimeout(volumeCommandRef.current);
        }

        volumeCommandRef.current = setTimeout(() => {
          volumeQueueRef.current = volumeQueueRef.current
            .then(() => {
              if (request !== volumeRequestRef.current) {
                return;
              }

              return deviceClient.setVolume(target, Math.round(volume * 100));
            })
            .catch((error) => {
              console.error('Setting the device volume failed:', error);
              if (request !== volumeRequestRef.current) {
                return;
              }

              toast.error(i18n.t('MusicPlayer.deviceError'));
              setPendingVolume(null);
            });
        }, VOLUME_SETTLE_MS);

        return;
      }

      if (!audioRef.current) {
        return;
      }

      audioRef.current.volume = volume;
      setPlayerState((prev) => ({ ...prev, localVolume: volume }));
    },
    [activeDevice],
  );

  const reportedVolume = speaker?.volume;
  useEffect(() => {
    if (pendingVolume === null || reportedVolume === undefined) {
      return;
    }

    if (Math.abs(reportedVolume / 100 - pendingVolume) < 0.01) {
      setPendingVolume(null);
      return;
    }

    const timer = setTimeout(() => setPendingVolume(null), VOLUME_REPORT_GRACE_MS);
    return () => clearTimeout(timer);
  }, [reportedVolume, pendingVolume]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the identity of the device is what invalidates it, not the object
  useEffect(() => {
    setPendingVolume(null);
    if (volumeCommandRef.current) {
      clearTimeout(volumeCommandRef.current);
      volumeCommandRef.current = null;
    }

    return () => {
      volumeRequestRef.current++;
      if (volumeCommandRef.current) {
        clearTimeout(volumeCommandRef.current);
        volumeCommandRef.current = null;
      }
    };
  }, [activeDevice?.id]);

  const playHere = useCallback(
    async (track: Track, at: number, from: Device) => {
      deviceDecidedRef.current = true;
      const generation = retireSpeakerWork();
      setActiveDevice(null);

      const resume = () => resumeHere(generation, track, at);
      await speakerOp(() => deviceClient.stop(from.id), {
        done: resume,
        failed: (error) => {
          console.error('Stopping the device that was playing failed:', error);
          resume();
        },
      });
    },
    [resumeHere, retireSpeakerWork, speakerOp],
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
      const wasPlaying = playerState.isPlaying;
      const previous = activeDevice;
      deviceDecidedRef.current = true;
      const generation = retireSpeakerWork();
      setIsLoading(false);
      setActiveDevice(device);

      if (wasPlaying && audioRef.current) {
        audioRef.current.pause();
      }

      const track = currentTrackRef.current;

      const playbackPosition = previous && isNetworkDevice(previous) ? speakerReachedRef.current : positionRef.current;

      if (!device && previous && isNetworkDevice(previous) && wasPlaying && track) {
        const resumeAt = playbackPosition;
        const resume = () => resumeHere(generation, track, resumeAt);
        await speakerOp(() => deviceClient.stop(previous.id), {
          done: resume,
          failed: (error) => {
            console.error('Stopping the device failed:', error);
            resume();
          },
        });

        return;
      }

      if (device && isNetworkDevice(device) && wasPlaying && track) {
        if (previous && isNetworkDevice(previous) && previous.id !== device.id) {
          await speakerOp(() => deviceClient.stop(previous.id), {
            failed: (error) => console.error('Stopping the device failed:', error),
          });
        }

        await speakerOp(() => deviceClient.play(device.id, track.id, Math.round(playbackPosition)), {
          done: () => setPlayerState((prev) => ({ ...prev, isPlaying: true })),
          failed: (error) => {
            console.error('Handing playback to the device failed:', error);
            toast.error(i18n.t('MusicPlayer.deviceError'));
            setPlayerState((prev) => ({ ...prev, isPlaying: false }));
          },
        });
      } else if (wasPlaying) {
        setPlayerState((prev) => ({ ...prev, isPlaying: false }));
      }
    },
    [playerState.isPlaying, activeDevice, resumeHere, retireSpeakerWork, speakerOp],
  );

  useEffect(() => {
    if (!playerState.currentTrack) {
      return;
    }

    const track = playerState.currentTrack;
    const album = albumsById.get(track.album);
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
        artist: artistNames(track.artists, artistsById) || 'Unknown Artist',
        album: album?.name || 'Unknown Album',
        artwork: album ? getAlbumCoverUrl(album) : undefined,
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
      artist: artistNames(track.artists, artistsById) || 'Unknown Artist',
      album: album?.name || 'Unknown Album',
      artwork: (() => {
        const url = album ? getAlbumCoverUrl(album) : undefined;
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
  }, [isNativePlatform, playerState.currentTrack, albumsById, artistsById, play, pause, playNext, playPrevious, seek]);

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

  useEffect(() => {
    if (!playerState.currentTrack) {
      return;
    }

    if (isNativePlatform) {
      nativeAudioService.setPosition(playerState.currentTime, playerState.currentTrack.duration || 0, playerState.isPlaying ? 1.0 : 0.0);
    }
  }, [isNativePlatform, playerState.currentTrack, playerState.currentTime, playerState.isPlaying]);

  useEffect(() => {
    if (deviceDecidedRef.current || activeDevice || isPlayingRef.current) {
      return;
    }

    const speaker = devices.find((d) => isNetworkDevice(d) && d.playing && d.usable);
    if (!speaker) {
      return;
    }

    deviceDecidedRef.current = true;
    setActiveDevice(speaker);
  }, [devices, activeDevice]);

  useEffect(() => {
    if (!activeDevice || devices.length === 0) {
      return;
    }

    if (!devices.some((device) => device.id === activeDevice.id)) {
      retireSpeakerWork();
      setActiveDevice(null);
    }
  }, [devices, activeDevice, retireSpeakerWork]);

  const speakerTrackId = speaker?.trackId ?? '';
  const { data: speakerTrackRows = [] } = useLiveQuery({ query: (q) => q.from({ tracks: trackCollection }).where(({ tracks }) => eq(tracks.id, speakerTrackId)) });
  useEffect(() => {
    const track = (speakerTrackRows as unknown as Track[])[0];
    if (!track) {
      return;
    }

    setPlayerState((prev) => (prev.currentTrack ? prev : { ...prev, currentTrack: track }));
  }, [speakerTrackRows]);

  if (speaker?.playing && Date.now() - seekedAtRef.current >= SEEK_SETTLE_MS) {
    speakerReachedRef.current = speakerPosition;
  }

  useEffect(() => {
    if (!speaker) {
      return;
    }

    setPlayerState((prev) => (prev.isPlaying === speaker.playing ? prev : { ...prev, isPlaying: speaker.playing }));
  }, [speaker]);

  useEffect(() => {
    if (!speaker || speaker.playing || !currentTrackRef.current) {
      return;
    }

    const { duration } = currentTrackRef.current;
    if (duration > 0 && speakerReachedRef.current >= duration - SPEAKER_END_TOLERANCE) {
      const finished = currentTrackRef.current;
      speakerReachedRef.current = 0;
      if (playerState.repeatMode === 'one') {
        playTrackRef.current(finished, 0);
        return;
      }

      playNext();
    }
  }, [speaker, playNext, playerState.repeatMode]);

  const speakerCurrentTime = speaker && Date.now() - seekedAtRef.current >= SEEK_SETTLE_MS ? speakerPosition : playerState.currentTime;

  const volume = pendingVolume ?? (speaker ? speaker.volume / 100 : playerState.localVolume);

  const value: MusicPlayerContextValue = {
    currentTrack: playerState.currentTrack,
    isPlaying: playerState.isPlaying,
    isLoading,
    volume,
    currentTime: speakerCurrentTime,
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
    playHere,
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
