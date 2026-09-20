import { Capacitor } from '@capacitor/core';
import { useLiveQuery } from '@tanstack/react-db';
import { useAuth } from 'pocketbase-react-hooks';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { deviceClient } from '@/clients/device.client';
import { playerClient } from '@/clients/player.client';
import { albumCollection } from '@/collections/album.collection';
import { artistCollection } from '@/collections/artist.collection';
import { trackCollection } from '@/collections/track.collection';
import { trackPlayCollection } from '@/collections/track-play.collection';
import { artistNames } from '@/hooks/use-library-index';
import { usePlayerQueue, usePlayerRead, usePlayerState } from '@/hooks/use-player-state';
import { usePlayheadTime } from '@/hooks/use-playhead';
import i18n from '@/i18n';
import { reached } from '@/lib/clock';
import { config } from '@/lib/config';
import { getAlbumCoverUrl } from '@/lib/cover-url';
import { getDevices, getMyDeviceId, subscribeCommands, subscribeDevices, subscribeRegistration } from '@/lib/device-presence';
import { correctionFor } from '@/lib/drift';
import { apply } from '@/lib/player-state';
import type { Playhead } from '@/lib/playhead';
import { playheadOf } from '@/lib/playhead';
import { serverNow, whenMeasured } from '@/lib/server-clock';
import { startsIn } from '@/lib/start-at';
import { getStreamToken } from '@/lib/stream-token';
import { rememberVolume, storedVolume } from '@/lib/volume';
import type { Album, Artist, Device, PlayerState, RepeatMode, Track, TrackPlay } from '@/shared';
import { nativeAudioService } from '../services';

export type AudioFormat = 'source' | 'mp3' | 'flac' | 'wav' | 'aac';

interface MusicPlayerContextValue {
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  currentTime: number;
  queue: Track[];
  repeatMode: RepeatMode;
  shuffle: boolean;

  devices: Device[];
  activeDevice: Device | null;
  playsHere: boolean;
  playhead: Playhead;
  media: HTMLAudioElement | null;
  audioFormat: AudioFormat;

  play: (tracks: Track[]) => void;
  togglePlayPause: () => void;
  playNext: () => void;
  playPrevious: () => void;
  skipTo: (track: Track) => void;

  seek: (time: number) => void;
  setVolume: (volume: number) => void;

  toggleRepeat: () => void;
  toggleShuffle: () => void;

  addToQueue: (tracks: Track[]) => void;
  removeFromQueue: (trackId: string) => void;
  clearQueue: () => void;

  playOn: (devices: Device[]) => void;
  joinDevice: (device: Device) => void;
  leaveDevice: (device: Device) => void;

  setAudioFormat: (format: AudioFormat) => void;
  audioElement: HTMLAudioElement | null;
}

const COMPLETED_AT = 0.9;

async function reasonFor(src: string): Promise<string | null> {
  if (!src) {
    return null;
  }

  try {
    const response = await fetch(src, { headers: { Range: 'bytes=0-0' } });
    if (response.ok || !response.headers.get('content-type')?.includes('json')) {
      return null;
    }

    const body = (await response.json()) as { message?: string };
    return body.message ?? null;
  } catch {
    return null;
  }
}

const VOLUME_SETTLE_MS = 200;

const IN_STEP_MS = 2000;

const MusicPlayerContext = createContext<MusicPlayerContextValue | undefined>(undefined);

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: trackPlays = [] } = useLiveQuery({ query: (q) => q.from({ trackPlays: trackPlayCollection }) });
  // Written where React can see them rather than during the render: a render
  // that is thrown away must not leave what the committed callbacks read.
  const trackPlaysRef = useRef<TrackPlay[]>([]);
  const userIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    trackPlaysRef.current = trackPlays as TrackPlay[];
  }, [trackPlays]);
  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  const state = usePlayerState();
  const stateRead = usePlayerRead();
  // The library is read straight from the collections rather than through the
  // index, which is mounted below this provider and would answer with nothing.
  const { data: allTracks = [] } = useLiveQuery({ query: (q) => q.from({ tracks: trackCollection }) });
  const { data: allAlbums = [] } = useLiveQuery({ query: (q) => q.from({ albums: albumCollection }) });
  const { data: allArtists = [] } = useLiveQuery({ query: (q) => q.from({ artists: artistCollection }) });
  const tracksById = useMemo(() => new Map((allTracks as unknown as Track[]).map((track) => [track.id, track])), [allTracks]);
  const albumsById = useMemo(() => new Map((allAlbums as unknown as Album[]).map((album) => [album.id, album])), [allAlbums]);
  const artistsById = useMemo(() => new Map((allArtists as unknown as Artist[]).map((artist) => [artist.id, artist])), [allArtists]);
  const known = useSyncExternalStore(subscribeDevices, getDevices);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [audioFormat, setAudioFormat] = useState<AudioFormat>('source');
  const [localVolume, setLocalVolume] = useState(storedVolume());
  const [deviceId, setDeviceId] = useState<string | null>(getMyDeviceId());

  const currentPlayIdRef = useRef<string | null>(null);
  const listenedRef = useRef(0);
  const lastTimeRef = useRef(0);
  const completedForRef = useRef<string | null>(null);
  const loadedRef = useRef<string | null>(null);
  // The run of the track this device was told to play. It is reported back at
  // the end, so that a run the server has already moved on from cannot end it
  // twice. Reading the record at that point would not do: by then it may
  // already name the run that replaced this one.
  const cycleRef = useRef(0);
  const waitingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Starting and stopping on an agreed moment both wait, first for the clock to
  // be measured and then for the moment itself. An order that arrives meanwhile
  // replaces the one waiting, which must then do nothing rather than let the
  // sound out, or stop it, after the device was told otherwise.
  const orderRef = useRef(0);
  const [holding, setHolding] = useState<string | null>(null);
  const loadRequestRef = useRef(0);

  const devices = state.devices.map((id) => known.find((device) => device.id === id)).filter((device): device is Device => device !== undefined);
  const playsHere = deviceId !== null && state.devices.includes(deviceId);
  const currentTrack = state.track ? (tracksById.get(state.track) ?? null) : null;
  const queue = usePlayerQueue(state, tracksById);
  // The element's own time is the truth only once it holds the track the record
  // names. Before that it reads zero, which is not where the playhead is.
  const media = playsHere && holding === state.track ? audioElement : null;
  // The playhead moves when something is actually carrying it: this device once
  // it holds the track, or another device we are only watching. A device that
  // should be playing and is not carries nothing, whatever the record says.
  const advancing = state.playing && (media !== null || !playsHere);
  // Whose level the one control shows: this device when it is playing, and
  // otherwise the first of the others, which is the one it is watching.
  const louder = devices.find((device) => device.id !== deviceId) ?? null;
  const playhead = useMemo(() => playheadOf({ position: state.position, positionAt: state.positionAt, duration: currentTrack?.duration ?? 0, advancing, loading: isLoading, media }), [state.position, state.positionAt, currentTrack?.duration, advancing, isLoading, media]);
  const currentTime = usePlayheadTime(playhead);

  const stateRef = useRef<PlayerState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const send = useCallback(async (order: () => Promise<PlayerState>, whenLost: string) => {
    try {
      apply(await order());
    } catch (error) {
      console.error('the player refused an order', error);
      toast.error(i18n.t(whenLost));
    }
  }, []);

  useEffect(() => subscribeRegistration(() => setDeviceId(getMyDeviceId())), []);

  // Taking the playback on before the record has been read would claim one that
  // is already coming out somewhere else, and a record that still says it is
  // playing would then start the music here on its own.
  const claimedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!deviceId || !stateRead || state.devices.length > 0 || claimedRef.current === deviceId) {
      return;
    }

    claimedRef.current = deviceId;
    playerClient
      .devices([deviceId])
      .then(apply)
      .catch((error) => console.error('this device could not take the playback', error));
  }, [deviceId, stateRead, state.devices.length]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = localVolume;
    }

    rememberVolume(localVolume);
  }, [localVolume]);

  /**
   * startHere lets the sound out at the moment the server named, so that
   * several devices begin together rather than each as soon as it is ready. A
   * device on its own is given no moment and starts at once; one that was told
   * too late starts where the others already are rather than behind them.
   */
  const startHere = useCallback((audio: HTMLAudioElement, at: number, startAt: number, current: () => boolean) => {
    if (waitingRef.current) {
      clearTimeout(waitingRef.current);
      waitingRef.current = null;
    }

    const go = () => {
      if (!current()) {
        return;
      }

      audio.play().catch((error) => {
        if (error.name === 'AbortError' || !current()) {
          return;
        }

        console.error('Playback failed:', error);
        setIsLoading(false);
        toast.error(i18n.t('MusicPlayer.playbackErrorGeneric'));
      });
    };

    if (!startAt) {
      go();
      return;
    }

    const ready = () => {
      void whenMeasured().then(() => {
        if (!current()) {
          return;
        }

        const when = startsIn(startAt, serverNow());
        if ('late' in when) {
          audio.currentTime = at + when.late / 1000;
          go();
          return;
        }

        waitingRef.current = setTimeout(go, when.wait);
      });
    };

    if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      ready();
      return;
    }
    audio.addEventListener('canplay', ready, { once: true });
  }, []);

  /** stopHere lets the sound out until the moment they were all told to stop. */
  const stopHere = useCallback((audio: HTMLAudioElement, stopAt: number, current: () => boolean) => {
    if (!stopAt) {
      audio.pause();
      return;
    }

    void whenMeasured().then(() => {
      if (!current()) {
        return;
      }

      const when = startsIn(stopAt, serverNow());
      if ('late' in when) {
        audio.pause();
        return;
      }

      if (waitingRef.current) {
        clearTimeout(waitingRef.current);
      }
      waitingRef.current = setTimeout(() => audio.pause(), when.wait);
    });
  }, []);

  const loadHere = useCallback(
    async (trackId: string, at: number, startAt: number, cycle: number, current: () => boolean) => {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      const request = ++loadRequestRef.current;
      setIsLoading(true);
      listenedRef.current = 0;
      lastTimeRef.current = 0;
      completedForRef.current = null;

      const params = new URLSearchParams();
      if (audioFormat !== 'source') {
        params.set('transcode', audioFormat);
      }

      try {
        params.set('token', await getStreamToken(trackId));
      } catch (error) {
        console.error('Stream token failed:', error);
        setIsLoading(false);
        // A start scheduled by the order before this one obeys nothing but its
        // timer, so leaving it armed lets the track this load was replacing
        // come back on its own.
        if (request === loadRequestRef.current && waitingRef.current) {
          clearTimeout(waitingRef.current);
          waitingRef.current = null;
        }
        return;
      }

      if (request !== loadRequestRef.current) {
        return;
      }

      loadedRef.current = trackId;
      cycleRef.current = cycle;
      setHolding(null);
      audio.src = `${config.server.url}/tracks/${trackId}/stream?${params.toString()}`;
      if (at > 0) {
        // The element is shared, so a listener left behind by a load that has
        // been overtaken would put the next track at this track's position.
        const place = () => {
          audio.removeEventListener('loadedmetadata', place);
          if (request === loadRequestRef.current) {
            audio.currentTime = at;
          }
        };
        audio.addEventListener('loadedmetadata', place);
      }

      const userId = userIdRef.current;
      if (userId) {
        const playId = trackPlayCollection.utils.newId();
        currentPlayIdRef.current = playId;
        trackPlayCollection.insert({ id: playId, user: userId, track: trackId, completed: false } as TrackPlay);
      }

      startHere(audio, at, startAt, () => current() && request === loadRequestRef.current);
    },
    [audioFormat, startHere],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: the audio element must only be created once
  useEffect(() => {
    const audio = new Audio();
    audio.volume = localVolume;
    audioRef.current = audio;
    setAudioElement(audio);

    const onTimeUpdate = () => {
      const delta = audio.currentTime - lastTimeRef.current;
      if (delta > 0 && delta < 2) {
        listenedRef.current += delta;
      }
      lastTimeRef.current = audio.currentTime;

      const trackId = loadedRef.current;
      const playId = currentPlayIdRef.current;
      if (!trackId || !playId || trackId === completedForRef.current || audio.duration <= 0 || listenedRef.current < audio.duration * COMPLETED_AT) {
        return;
      }

      const play = trackPlaysRef.current.find((p) => p.id === playId) ?? trackPlaysRef.current.find((p) => p.track === trackId && p.user === userIdRef.current && !p.completed);
      if (play) {
        trackPlayCollection.update(play.id, (draft) => {
          draft.completed = true;
        });
        completedForRef.current = trackId;
      }
    };

    const onEnded = () => {
      const ended = loadedRef.current;
      if (!ended) {
        return;
      }

      playerClient
        .ended(ended, cycleRef.current)
        .then(apply)
        .catch((error) => console.error('the end of a track was not reported', error));
    };

    // The element speaks for the playhead only once it is loaded and sitting
    // where it was told to. Before that it reads zero, and a bar following it
    // blinks back to the start on its way to the right place.
    const stopLoading = () => {
      setIsLoading(false);
      setHolding(loadedRef.current);
    };
    const startLoading = () => setIsLoading(true);

    // A stream that will not play is silence with a moving progress bar
    // otherwise: the record says it is playing and nothing contradicts it.
    // A device that cannot play says so, or the record goes on claiming sound
    // that nobody can hear and every other device draws a moving playhead.
    //
    // An audio element reports only that the source was unusable; the reason
    // the server gave is in a body it never shows. Asking again for the first
    // byte is what turns "format error" into what actually went wrong.
    const onError = () => {
      setIsLoading(false);
      const src = audio.currentSrc;
      console.error('the stream would not play', audio.error?.code, audio.error?.message, src);
      playerClient
        .pause()
        .then(apply)
        .catch(() => undefined);
      void reasonFor(src).then((reason) => toast.error(reason ?? i18n.t('MusicPlayer.playbackErrorGeneric')));
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('canplay', stopLoading);
    audio.addEventListener('playing', stopLoading);
    audio.addEventListener('waiting', startLoading);
    audio.addEventListener('error', onError);
    audio.addEventListener('stalled', startLoading);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('canplay', stopLoading);
      audio.removeEventListener('playing', stopLoading);
      audio.removeEventListener('waiting', startLoading);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('stalled', startLoading);
      if (waitingRef.current) {
        clearTimeout(waitingRef.current);
        waitingRef.current = null;
      }
      audio.pause();
    };
  }, []);

  // The orders this tab sends never touch the audio element. The server answers
  // them by telling the devices it is playing on what to do, and this tab obeys
  // that like any other device, which is what stops playback being implemented
  // twice.
  useEffect(
    () =>
      subscribeCommands((command) => {
        if (command.deviceId !== getMyDeviceId()) {
          return;
        }

        const audio = audioRef.current;
        if (!audio) {
          return;
        }

        // Only an order that decides whether sound comes out takes an epoch. A
        // volume or a seek arriving beside a scheduled start leaves it alone.
        const takeOver = () => {
          const order = ++orderRef.current;
          return () => order === orderRef.current;
        };

        const action = command.action;
        if (action.startsWith('play:')) {
          const current = takeOver();
          const [, trackId, at, startAt, cycle] = action.split(':');
          void loadHere(trackId, Number(at) || 0, Number(startAt) || 0, Number(cycle) || 0, current);
        } else if (action.startsWith('resume:')) {
          const current = takeOver();
          const [, trackId, at, startAt, cycle] = action.split(':');
          const from = Number(at) || 0;
          const when = Number(startAt) || 0;
          if (loadedRef.current === trackId && audio.src) {
            cycleRef.current = Number(cycle) || 0;
            // Carrying on from where this device stopped would keep whatever
            // gap the stop left. The record says where playback is, and that is
            // what every device comes back to.
            if (when) {
              audio.currentTime = from;
            }
            startHere(audio, when ? from : audio.currentTime, when, current);
          } else {
            void loadHere(trackId, from, when, Number(cycle) || 0, current);
          }
        } else if (action === 'stop' || action.startsWith('pause:')) {
          const current = takeOver();
          if (waitingRef.current) {
            clearTimeout(waitingRef.current);
            waitingRef.current = null;
          }
          stopHere(audio, action === 'stop' ? 0 : Number(action.slice(6)) || 0, current);
        } else if (action.startsWith('seek:')) {
          audio.currentTime = Number(action.slice(5)) || 0;
        } else if (action.startsWith('volume:')) {
          setLocalVolume(Number(action.slice(7)) / 100);
        }
      }),
    [loadHere, startHere, stopHere],
  );

  // Devices told to start together still walk apart, because no two decoders
  // run at quite the same speed. Each one watches its own distance from the
  // record and bends its speed by a thousandth to close it, which is inaudible
  // and needs no leader: they are all following the same written position.
  // Alone, there is nobody to be in step with and the element is the truth.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!media || !state.playing || state.devices.length < 2) {
      audio.playbackRate = 1;
      return;
    }

    // The position is read when the correction is made rather than depended on
    // here: a record written while the timer waits would otherwise restart it,
    // and a device losing its turn every time the record moves never corrects.
    const timer = setInterval(() => {
      const record = stateRef.current;
      const drift = audio.currentTime - reached(record.position, record.positionAt, true, serverNow());
      const { rate, seek } = correctionFor(drift);
      if (seek) {
        audio.currentTime = audio.currentTime - drift;
      }
      audio.playbackRate = rate;
    }, IN_STEP_MS);

    return () => {
      clearInterval(timer);
      audio.playbackRate = 1;
    };
  }, [media, state.playing, state.devices.length]);

  const play = useCallback(
    (tracks: Track[]) => {
      if (tracks.length === 0) {
        return;
      }
      void send(() => playerClient.play(tracks.map((track) => track.id)), 'MusicPlayer.playbackErrorGeneric');
    },
    [send],
  );

  const togglePlayPause = useCallback(() => {
    void send(() => (stateRef.current.playing ? playerClient.pause() : playerClient.resume()), 'MusicPlayer.deviceError');
  }, [send]);

  const playNext = useCallback(() => void send(() => playerClient.next(), 'MusicPlayer.deviceError'), [send]);
  const playPrevious = useCallback(() => void send(() => playerClient.previous(), 'MusicPlayer.deviceError'), [send]);
  const skipTo = useCallback((track: Track) => void send(() => playerClient.skip(track.id), 'MusicPlayer.deviceError'), [send]);
  const seek = useCallback((time: number) => void send(() => playerClient.seek(Math.max(0, time)), 'MusicPlayer.deviceError'), [send]);
  const toggleRepeat = useCallback(() => {
    const next: RepeatMode = stateRef.current.repeat === 'none' ? 'one' : stateRef.current.repeat === 'one' ? 'all' : 'none';
    void send(() => playerClient.repeat(next), 'MusicPlayer.deviceError');
  }, [send]);
  const toggleShuffle = useCallback(() => void send(() => playerClient.shuffle(!stateRef.current.shuffle), 'MusicPlayer.deviceError'), [send]);
  // One after another, and only the last answer applied: the server takes them
  // in order, but answers arriving out of order would leave the list on screen
  // showing whichever came back last.
  const addToQueue = useCallback(
    (tracks: Track[]) => {
      void send(async () => {
        let last = stateRef.current;
        for (const track of tracks) {
          last = await playerClient.add(track.id);
        }
        return last;
      }, 'MusicPlayer.deviceError');
    },
    [send],
  );
  const removeFromQueue = useCallback((trackId: string) => void send(() => playerClient.remove(trackId), 'MusicPlayer.deviceError'), [send]);
  const clearQueue = useCallback(() => void send(() => playerClient.clear(), 'MusicPlayer.deviceError'), [send]);
  const playOn = useCallback((next: Device[]) => void send(() => playerClient.devices(next.map((device) => device.id)), 'MusicPlayer.deviceError'), [send]);
  const joinDevice = useCallback((device: Device) => void send(() => playerClient.join(device.id), 'MusicPlayer.deviceError'), [send]);
  const leaveDevice = useCallback((device: Device) => void send(() => playerClient.leave(device.id), 'MusicPlayer.deviceError'), [send]);

  // How loud a device is goes through the server even when the device is this
  // one, so that every other device sees the change rather than only this one.
  // The sound follows the finger; the server hears about it once it stops. It
  // is set on whichever device the level being shown belongs to, or the control
  // would move a number it is not displaying.
  const tellingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setVolume = useCallback(
    (level: number) => {
      const target = playsHere ? deviceId : (louder?.id ?? null);
      if (playsHere) {
        setLocalVolume(level);
      }
      if (!target) {
        return;
      }

      if (tellingRef.current) {
        clearTimeout(tellingRef.current);
      }
      tellingRef.current = setTimeout(() => {
        deviceClient.setVolume(target, Math.round(level * 100)).catch((error) => console.error('Setting the device volume failed:', error));
      }, VOLUME_SETTLE_MS);
    },
    [deviceId, playsHere, louder],
  );

  useEffect(
    () => () => {
      if (tellingRef.current) {
        clearTimeout(tellingRef.current);
      }
    },
    [],
  );

  const volume = playsHere ? localVolume : (louder?.volume ?? 100) / 100;

  useEffect(() => {
    if (!currentTrack) {
      return;
    }

    const album = albumsById.get(currentTrack.album);
    const artist = artistNames(currentTrack.artists, artistsById);
    if (Capacitor.isNativePlatform()) {
      nativeAudioService.initialize({ onPlay: togglePlayPause, onPause: togglePlayPause, onNext: playNext, onPrevious: playPrevious, onSeek: seek });
      nativeAudioService.setMetadata({ title: currentTrack.title, artist, album: album?.name ?? '', artwork: album ? getAlbumCoverUrl(album) : undefined, duration: currentTrack.duration });
      return () => nativeAudioService.destroy();
    }

    if (!('mediaSession' in navigator)) {
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist,
      album: album?.name ?? '',
      artwork: album && getAlbumCoverUrl(album) ? [{ src: getAlbumCoverUrl(album) as string, sizes: '512x512', type: 'image/jpeg' }] : [],
    });
    navigator.mediaSession.setActionHandler('play', togglePlayPause);
    navigator.mediaSession.setActionHandler('pause', togglePlayPause);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
    navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
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
  }, [currentTrack, albumsById, artistsById, togglePlayPause, playNext, playPrevious, seek]);

  const value: MusicPlayerContextValue = {
    currentTrack,
    isPlaying: state.playing,
    isLoading,
    volume,
    currentTime,
    queue,
    repeatMode: state.repeat,
    shuffle: state.shuffle,

    devices,
    activeDevice: devices[0] ?? null,
    playsHere,
    playhead,
    media,
    audioFormat,

    play,
    togglePlayPause,
    playNext,
    playPrevious,
    skipTo,
    seek,
    setVolume,
    toggleRepeat,
    toggleShuffle,
    addToQueue,
    removeFromQueue,
    clearQueue,
    playOn,
    joinDevice,
    leaveDevice,
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
