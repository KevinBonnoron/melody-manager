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

// How long the speaker's reported position is distrusted after a seek.
const SEEK_SETTLE_MS = 2000;

// How long a drag is allowed to settle before the device is told, and how long
// the level asked for is believed over the one reported.
const VOLUME_SETTLE_MS = 150;
const VOLUME_REPORT_GRACE_MS = 3000;

// How close to the end counts as having reached it, given the speaker is asked
// where it is once a second over those last seconds.
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
  // Taken over at most once, and never again after this tab has chosen for
  // itself: asking to play here would otherwise hand the speaker straight back.
  const deviceDecidedRef = useRef(false);
  const positionRef = useRef(0);
  // Where the speaker had got to while it was still playing. A speaker that
  // reaches the end of a track reports itself stopped at nought, so its own
  // final position says nothing about whether it finished or was paused.
  const speakerReachedRef = useRef(0);
  const seekOnLoadRef = useRef<(() => void) | null>(null);
  const endedHandledForTrackIdRef = useRef<string | null>(null);
  const currentPlayIdRef = useRef<string | null>(null);
  const lastPlayRef = useRef<{ trackId: string; at: number } | null>(null);
  const playCompletedForTrackIdRef = useRef<string | null>(null);
  const listenedTimeRef = useRef(0);
  const lastTimeUpdateRef = useRef(0);
  const playRequestRef = useRef(0);
  // Speaker commands from this tab leave one at a time. Two of them in flight
  // race at the speaker, and the loser decides: a stop issued while a play is
  // still on its way can land first, and the speaker starts anyway, in the room
  // the listener has just left. Ordering between tabs is the server's to give,
  // per speaker; this is the half a single listener can create.
  const speakerQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const seekRequestRef = useRef(0);
  const [activeDevice, setActiveDevice] = useState<Device | null>(null);
  // The speaker as the server last saw it. It plays on its own, so what it
  // reports wins over anything this tab believes.
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
    localVolume: 1.0,
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

  // Retires whatever this tab is still waiting on from a speaker. Picking a
  // device, asking for a track, or losing the device does it: from then on, the
  // answers to the commands already in flight concern a session nobody is in.
  const retireSpeakerWork = useCallback(() => ++playRequestRef.current, []);

  // Picking the track up here, on the tick after the device change rather than
  // during it: playTrack sends to whichever device it was built against, so it
  // has to be built after the switch has landed. That tick is also long enough
  // for the listener to ask for something else, and a resume that fires anyway
  // would start the track they left behind.
  const resumeHere = useCallback((generation: number, track: Track, at: number) => {
    setTimeout(() => {
      if (generation === playRequestRef.current) {
        playTrackRef.current(track, at);
      }
    }, 0);
  }, []);

  // Everything this tab asks of a speaker goes through here, because these
  // commands all need two things and no caller should have to remember either.
  //
  // They leave one at a time. Two in flight race at the speaker and the loser
  // decides: a stop issued during a handover could land before the play it was
  // meant to undo, and the speaker would start in the room just left.
  //
  // And their answer is dropped once the listener has moved on. A command that
  // waits its turn answers late, for a device, a track or a position that may no
  // longer be the one on screen. That is why `done` and `failed` are handed in
  // rather than written after an await: there is no spelling of this that
  // forgets the check.
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
      // Asking for a track is itself a decision about where it plays: whatever
      // is selected now, including this tab, is the target. Without this the
      // adoption below could still fire in the gap before the audio starts and
      // hand the session to a speaker the listener did not pick.
      deviceDecidedRef.current = true;
      // Which request this is. Starting a track waits on a stream token and on
      // the speaker, and a listener skipping through a queue outruns both: the
      // older call would come back afterwards and set the source, or report a
      // failure, for a track that is no longer the one playing.
      const request = retireSpeakerWork();
      endedHandledForTrackIdRef.current = null;
      playCompletedForTrackIdRef.current = null;
      listenedTimeRef.current = 0;
      lastTimeUpdateRef.current = 0;

      // Insert play record immediately (completed: false) for history
      // Guard against double calls (React strict mode / setState double-invoke)
      const userId = userIdRef.current;
      const now = Date.now();
      // The same track starting twice within a second is one play: StrictMode
      // double-invokes this, and so does an impatient second click. What is
      // being guarded against is tracked on its own rather than read back out
      // of the record's key.
      const last = lastPlayRef.current;
      const isDuplicate = last?.trackId === track.id && now - last.at < 1000;
      if (userId && !isDuplicate) {
        // A PocketBase id is fifteen characters and anything longer is refused,
        // which rolled the optimistic row back with only a console error to show
        // for it. The collection mints ids the server will accept.
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
        // The position travels with the play request: asking separately meant a
        // seek the speaker refused reported the whole playback as failed, where
        // the server treats it as a speaker that simply started at nought.
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
      // The listener waits for metadata that may never come: a second playTrack
      // replacing the source before it fires would otherwise leave it armed, and
      // the next track would start at the previous one's offset.
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
        // The promise outlives the request that made it, and a track replaced
        // before it settles fails by definition. Reporting that would put the
        // track now playing on screen as stopped.
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

  // Sync volume to audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = playerState.localVolume;
    }
  }, [playerState.localVolume]);

  // Initialize audio element, intentionally runs once, initial volume read at mount only
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
    if (activeDevice && isNetworkDevice(activeDevice)) {
      // Recorded before the command goes out, not after it comes back. The
      // command waits its turn behind the others, and a listener who pauses and
      // switches device in that gap would otherwise be resumed here on the
      // strength of a transport state they had already changed.
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
        // A speaker with nothing loaded has nothing to resume: hand it the
        // current track rather than reporting a failure the user cannot act on.
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

  // A speaker is handed one track at a time and holds no queue of its own, so
  // moving through the queue is the same work wherever the sound comes out:
  // pick the next track here, and let playTrack send it where it belongs.
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
  const [pendingVolume, setPendingVolume] = useState<number | null>(null);
  const seek = useCallback(
    async (time: number) => {
      if (activeDevice && isNetworkDevice(activeDevice)) {
        // A poll in flight when the seek lands answers the position before it,
        // which drags the bar back to where the listener just left. Said before
        // the command rather than after it, for the same reason as pause: the
        // handover reads this position to decide where to pick the track up.
        // Bumped before the command is queued, so a newer seek retires this one
        // the way picking a device retires a play: what it said is taken back
        // only while it is still the last thing said.
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
      // A device's level belongs to the device: told, not recorded here, and
      // read back from what it reports.
      //
      // Told once, though. A slider emits a change per pixel and each one is a
      // round trip over the network, so a drag across the bar used to queue
      // dozens of them and the level crawled after the hand. Only where the drag
      // settles is sent, and until the device answers the slider follows the
      // hand rather than the round trip.
      if (activeDevice && isNetworkDevice(activeDevice)) {
        const target = activeDevice.id;
        setPendingVolume(volume);
        if (volumeCommandRef.current) {
          clearTimeout(volumeCommandRef.current);
        }

        volumeCommandRef.current = setTimeout(async () => {
          try {
            await deviceClient.setVolume(target, Math.round(volume * 100));
          } catch (error) {
            console.error('Setting the device volume failed:', error);
            toast.error(i18n.t('MusicPlayer.deviceError'));
            setPendingVolume(null);
          }
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

  // The level asked for stands until the device reports it back, which is a poll
  // away, or until it has had long enough that something went wrong and what the
  // device says is the better answer.
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

  // A pending level belongs to the device it was meant for.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the identity of the device is what invalidates it, not the object
  useEffect(() => {
    setPendingVolume(null);
    if (volumeCommandRef.current) {
      clearTimeout(volumeCommandRef.current);
      volumeCommandRef.current = null;
    }
  }, [activeDevice?.id]);

  // Taking playback back from wherever it is, a speaker or another tab. The two
  // halves have to happen in this order: this browser becomes the target first,
  // and only then does the track start. playTrack sends to whichever device it
  // was built against, so starting first sends the track straight back to the
  // device it was being taken from, which is what a listener sees as the button
  // doing nothing the first time and working the second.
  const playHere = useCallback(
    async (track: Track, at: number, from: Device) => {
      deviceDecidedRef.current = true;
      const generation = retireSpeakerWork();
      setActiveDevice(null);

      // A device that refuses to stop is still left behind: losing the track as
      // well as the room would be the worse of the two.
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
      // Picking a device retires whatever the last one was still waiting for. A
      // play still holding a stream token would otherwise come back and start
      // the browser on the track that was just handed to a speaker, and the two
      // would play it in two rooms. The spinner it put up goes with it: the
      // request it belonged to now returns at the guard without reaching the
      // line that would have taken it down, and every command still queued for
      // the speaker answers into the void from here on.
      const generation = retireSpeakerWork();
      setIsLoading(false);
      setActiveDevice(device);

      if (wasPlaying && audioRef.current) {
        audioRef.current.pause();
      }

      const track = currentTrackRef.current;

      // Coming back from a speaker is the same move in reverse, and it has two
      // halves: silence the speaker, and pick the track up here where it left
      // off. Doing only the first leaves it playing on in the other room.
      // Where playback actually is. positionRef mirrors the local player's clock,
      // which stands still for as long as a speaker is the one playing, so when a
      // speaker was playing its own reported position is the only one that moved.
      const playbackPosition = previous && isNetworkDevice(previous) ? speakerReachedRef.current : positionRef.current;

      if (!device && previous && isNetworkDevice(previous) && wasPlaying && track) {
        const resumeAt = playbackPosition;
        // A speaker that refuses to stop is still left behind: losing the track
        // as well as the room would be the worse of the two.
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

      // Choosing a speaker moves the playback there rather than ending it: the
      // track carries on from where it was, which is what picking a device means.
      if (device && isNetworkDevice(device) && wasPlaying && track) {
        // The server tells the chosen speaker to play; nothing tells the one
        // being left to stop, and two speakers playing the same track in two
        // rooms is not what picking a device means.
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

  // Media Session API for background playback
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

  // A speaker that is playing owns the session: a tab opening or reloading
  // mid-playback takes it over as its own target, so its transport buttons move
  // the queue held here rather than asking the speaker to find a next track it
  // was never given.
  useEffect(() => {
    if (deviceDecidedRef.current || activeDevice || isPlayingRef.current) {
      return;
    }

    // Playing, not merely known: a speaker that was paused from its own app
    // still answers with its last track, and adopting it there left this tab
    // sending every later play to a room nobody was listening in.
    const speaker = devices.find((d) => isNetworkDevice(d) && d.playing);
    if (!speaker) {
      return;
    }

    deviceDecidedRef.current = true;
    setActiveDevice(speaker);
  }, [devices, activeDevice]);

  // A device that is no longer in the list cannot be played on, and keeping it
  // selected sends every later play into silence while the transport keeps
  // saying it worked. An empty list is a stream reconnecting, not a speaker
  // going away, so it is left alone.
  useEffect(() => {
    if (!activeDevice || devices.length === 0) {
      return;
    }

    if (!devices.some((device) => device.id === activeDevice.id)) {
      // Losing the device retires what was asked of it, the same as picking
      // another one would: a command still queued for a speaker that has gone
      // answers for a session nobody is in.
      retireSpeakerWork();
      setActiveDevice(null);
    }
  }, [devices, activeDevice, retireSpeakerWork]);

  // The speaker knows which track it is playing; a tab that has just taken it
  // over does not, and without it there is nothing to show and nowhere in the
  // queue to move on from.
  const speakerTrackId = speaker?.trackId ?? '';
  const { data: speakerTrackRows = [] } = useLiveQuery({ query: (q) => q.from({ tracks: trackCollection }).where(({ tracks }) => eq(tracks.id, speakerTrackId)) });
  useEffect(() => {
    const track = (speakerTrackRows as unknown as Track[])[0];
    if (!track) {
      return;
    }

    setPlayerState((prev) => (prev.currentTrack ? prev : { ...prev, currentTrack: track }));
  }, [speakerTrackRows]);

  // Not while a seek is settling: the speaker keeps answering with the position
  // from before it for a poll or two, and taking that back would undo what the
  // listener just asked for, on screen and in a handover.
  if (speaker?.playing && Date.now() - seekedAtRef.current >= SEEK_SETTLE_MS) {
    speakerReachedRef.current = speakerPosition;
  }

  // A speaker reports over the same stream as every other device, polled once by
  // the server rather than once per second by each tab. Its transport state is
  // authoritative; the position between two reports is counted locally.
  useEffect(() => {
    if (!speaker) {
      return;
    }

    setPlayerState((prev) => (prev.isPlaying === speaker.playing ? prev : { ...prev, isPlaying: speaker.playing }));
  }, [speaker]);

  // A speaker that stops where the track ran out has finished it; stopping
  // anywhere else is a pause. Only the queue lives here, so only this side can
  // move it on.
  useEffect(() => {
    if (!speaker || speaker.playing || !currentTrackRef.current) {
      return;
    }

    const { duration } = currentTrackRef.current;
    if (duration > 0 && speakerReachedRef.current >= duration - SPEAKER_END_TOLERANCE) {
      const finished = currentTrackRef.current;
      speakerReachedRef.current = 0;
      // The local player rewinds its own element for repeat-one; a speaker has
      // to be told to play the same track again, or the setting would only work
      // in the room the browser is in.
      if (playerState.repeatMode === 'one') {
        playTrackRef.current(finished, 0);
        return;
      }

      playNext();
    }
  }, [speaker, playNext, playerState.repeatMode]);

  // A seek is shown where it was asked for until the speaker confirms it: the
  // server nudges its watch on every command, but the answer still has to come
  // back from the speaker.
  const speakerCurrentTime = speaker && Date.now() - seekedAtRef.current >= SEEK_SETTLE_MS ? speakerPosition : playerState.currentTime;

  // Whose level the controls are showing and setting. The speaker's while one is
  // the active device, this browser's otherwise, and neither ever written over
  // the other.
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
