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
import { reached, runOf } from '@/lib/clock';
import { config } from '@/lib/config';
import { getAlbumCoverUrl } from '@/lib/cover-url';
import { checkAlive, getDevices, getMyDeviceId, subscribeCommands, subscribeDevices, subscribeRegistration } from '@/lib/device-presence';
import { correctionFor, hasPlayingSpeaker } from '@/lib/drift';
import { apply, refresh, snapshot } from '@/lib/player-state';
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
    return said(body.message ?? null);
  } catch {
    return null;
  }
}

// The server names what went wrong rather than describing it, so that it reads
// in the reader's own language and so that a failure's own words, which carry
// the server's paths and the address it resolved, never reach a listener.
const named = ['SOURCE_REFUSED', 'COOKIES_REQUIRED', 'CREDENTIALS_REQUIRED', 'PLAYBACK_FAILED'];

function said(message: string | null): string | null {
  if (message && named.includes(message)) {
    return i18n.t(`MusicPlayer.sourceError.${message}`);
  }
  return message;
}

const VOLUME_SETTLE_MS = 200;

const IN_STEP_MS = 2000;

// How often a device says where it has got to. Often enough that the record is
// never far from what is being heard, rarely enough to be nothing next to the
// audio it is describing.
const SAY_WHERE_MS = 10_000;

// How long a source is given to produce anything at all before it is asked for
// again. Generous, because the first play of a track cut out of a video waits
// for the cut to be made, and that is work rather than a fault.
const NOTHING_YET_MS = 45_000;
const ASK_AGAIN = 2;

// How near the record a device has to be for an order to play what it is
// already playing to be nothing new.
const ABOUT_THERE = 1;

// How many times a device asks for a playback nobody holds, and how long it
// leaves between asking.
const CLAIM_ATTEMPTS = 2;
const CLAIM_AGAIN_MS = 2_000;

// The same, for a page saying it is not the one playing. Sooner, because every
// moment it is not said is added to the position the playback is stopped at.
const STEP_BACK_ATTEMPTS = 3;
const STEP_BACK_AGAIN_MS = 750;

// How long a page that finds itself named in a playing record waits before
// saying it is not the one playing: long enough for a command it was just
// given to reach the element, short enough to add almost nothing to the
// position the playback is stopped at.
const STEP_BACK_WAIT_MS = 1_000;

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
  // The run whose first sound has already been reported. The record waits for
  // that report before its playhead moves, so it is sent the moment the sound
  // starts rather than at the next periodic one, and once per run.
  const heardRef = useRef(0);
  const waitingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stuckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadHereRef = useRef<(trackId: string, at: number, startAt: number, cycle: number, current: () => boolean, tries?: number) => Promise<void>>(async () => undefined);
  // Starting and stopping on an agreed moment both wait, first for the clock to
  // be measured and then for the moment itself. An order that arrives meanwhile
  // replaces the one waiting, which must then do nothing rather than let the
  // sound out, or stop it, after the device was told otherwise.
  const orderRef = useRef(0);
  const [holding, setHolding] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  // The load request still short of the element, from the order's acceptance
  // to the track actually held: the step-back waits it out, or a slow stream
  // token would look like a page making no sound. Zero means none pending.
  const pendingLoadRef = useRef(0);

  const devices = state.devices.map((id) => known.find((device) => device.id === id)).filter((device): device is Device => device !== undefined);
  const playsHere = deviceId !== null && state.devices.includes(deviceId);
  const currentTrack = state.track ? (tracksById.get(state.track) ?? null) : null;
  const queue = usePlayerQueue(state, tracksById);
  // The element's own time is the truth only once it holds the track the record
  // names. Before that it reads zero, which is not where the playhead is.
  const media = playsHere && holding === state.track ? audioElement : null;
  // The playhead moves when something is actually carrying it: this device once
  // it holds the track, or another device we are only watching once that one
  // has said it is making sound. A device that should be playing and is not
  // carries nothing, whatever the record says.
  const advancing = state.playing && (media !== null || (!playsHere && !state.waiting));
  // Another device still loading what it was told to play. Here it reads as
  // loading, as it would if this device were the one loading.
  const loadingElsewhere = state.playing && state.waiting && !playsHere;
  // Whose level the one control shows: this device when it is playing, and
  // otherwise the first of the others, which is the one it is watching.
  const louder = devices.find((device) => device.id !== deviceId) ?? null;
  // A load this device started for a playback that has since gone elsewhere
  // can leave its own flag up: nothing it holds will ever say it is ready.
  const loading = (playsHere && isLoading) || loadingElsewhere;
  const playhead = useMemo(() => playheadOf({ position: state.position, positionAt: state.positionAt, duration: currentTrack?.duration ?? 0, advancing, loading, media }), [state.position, state.positionAt, currentTrack?.duration, advancing, loading, media]);
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

  // A stream coming up is a device arriving or a device coming back, and the
  // second has everything that happened while it was away to catch up on.
  const reconcileRef = useRef<() => void>(() => undefined);
  // The claim guard and the marker for leaving on purpose. Being dropped from
  // the set and being unticked look the same from here; what separates them is
  // who gave the order, so only this device's own orders raise keptOut.
  const claimedRef = useRef<string | null>(null);
  const keptOutRef = useRef(false);
  // Counts registrations: each one brings the claim back below, because a
  // device whose stream has just come up is one the record can reach again.
  const [registeredAt, setRegisteredAt] = useState(0);
  useEffect(
    () =>
      subscribeRegistration(() => {
        setDeviceId(getMyDeviceId());
        if (!keptOutRef.current) {
          claimedRef.current = null;
        }
        setRegisteredAt((n) => n + 1);
        reconcileRef.current();
      }),
    [],
  );

  // A device obeys the record, and one the record no longer names has nothing
  // to obey: it goes quiet. The order to stop would come down the connection
  // that dropped, which is the one thing that cannot carry it, so a tab taken
  // out of the set while it was in the background goes on making sound that
  // nothing can stop and that no playhead describes.
  useEffect(() => {
    if (!stateRead || playsHere) {
      return;
    }

    // Before anything else, and whether or not there is sound to stop: a start
    // waiting on a moment, or on the element being ready, obeys nothing but
    // itself, and one left armed lets the sound back out after the device was
    // taken out of the set.
    orderRef.current++;
    if (waitingRef.current) {
      clearTimeout(waitingRef.current);
      waitingRef.current = null;
    }

    const audio = audioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
    }
  }, [stateRead, playsHere]);

  // Coming back to a tab that was away. Both connections it listens on, the
  // record's and this device's orders, can have been dropped while nothing was
  // watching, and what is held is then behind by everything that happened
  // since.
  useEffect(() => {
    const back = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      checkAlive();
      void refresh();
    };

    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, []);

  // A page that has just loaded is making no sound, whatever the record says it
  // is doing here. Reloading in the middle of a track leaves the record playing
  // on a device that no longer exists, and nothing else finds out: a browser
  // never reports where it has got to, so the record goes on working the
  // position out from how long it has supposedly been playing.
  //
  // So it says so, by leaving. On its own that stops the playback where it had
  // got to, which is what an empty set already means; beside a speaker it
  // leaves the speaker playing and becomes what it now is, something watching.
  //
  // At once, because every moment spent claiming to play is added to the
  // position it is stopped at.
  // A refusal must not be taken for having said it: the record would go on
  // counting a silent device as playing, and nothing would ever say otherwise.
  // So it is done when the server says it is, and until then it is only being
  // attempted.
  //
  // Not at once: an order this page gave is answered with the record naming
  // this device before the command carrying it to the element has landed, and
  // stepping back inside that gap would undo the order it gave. A page that
  // reloaded onto a record that was already playing is sent no such command:
  // nothing arrives, the moment passes, and it says so.
  const steppedBackRef = useRef(false);
  // The step-back's leave request while the server has not answered. An order
  // this device gives waits for it, or the two race and undo each other
  // whichever reaches the server last.
  const stepBackPendingRef = useRef<Promise<void> | null>(null);
  const [stepBackAttempt, setStepBackAttempt] = useState(0);
  useEffect(() => {
    if (!deviceId || !stateRead || !state.playing || !playsHere || loadedRef.current !== null) {
      return;
    }
    if (steppedBackRef.current) {
      return;
    }

    const timer = setInterval(() => {
      if (steppedBackRef.current || loadedRef.current !== null) {
        clearInterval(timer);
        return;
      }
      // A load on its way to the element — accepted, not held yet — is this
      // device carrying the record all the same. One that failed before
      // reaching the element leaves the marker clear and is waited out no
      // longer.
      if (pendingLoadRef.current !== 0) {
        return;
      }

      const leave = playerClient
        .leave(deviceId)
        .then((after) => {
          steppedBackRef.current = true;
          apply(after);
        })
        .catch((error) => {
          console.error('this device could not say it had stopped playing', error);
          if (stepBackAttempt < STEP_BACK_ATTEMPTS) {
            setTimeout(() => setStepBackAttempt((n) => n + 1), STEP_BACK_AGAIN_MS);
          }
        });
      // Only one leave is in flight; the retry above brings this effect back.
      clearInterval(timer);
      stepBackPendingRef.current = leave.then(
        () => undefined,
        () => undefined,
      );
    }, STEP_BACK_WAIT_MS);
    return () => clearInterval(timer);
  }, [deviceId, stateRead, state.playing, playsHere, stepBackAttempt]);

  // Taking the playback on before the record has been read would claim one that
  // is already coming out somewhere else, and a record that still says it is
  // playing would then start the music here on its own.
  // A refusal is not the end of it. Clearing the guard alone would not bring
  // the effect back, since none of what it watches has changed, so the attempt
  // is counted and the count is what brings it back. Twice, because a third
  // refusal is about something a fourth attempt will not fix.
  //
  // The guard is also cleared at each registration of this device's stream,
  // a moment or two after the kind of outage that takes a device out of the
  // set, and only then: a removal decided on another client is answered by
  // nothing here, and an order this device gives joins it again below.
  const [claimAttempt, setClaimAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: registeredAt is a pulse — each registration brings the claim back even though the effect reads nothing that changed.
  useEffect(() => {
    if (!deviceId || !stateRead || state.devices.length > 0 || keptOutRef.current || claimedRef.current === deviceId) {
      return;
    }

    claimedRef.current = deviceId;
    playerClient
      .devices([deviceId])
      .then(apply)
      .catch((error) => {
        console.error('this device could not take the playback', error);
        claimedRef.current = null;
        if (claimAttempt < CLAIM_ATTEMPTS) {
          setTimeout(() => setClaimAttempt((n) => n + 1), CLAIM_AGAIN_MS);
        }
      });
  }, [deviceId, stateRead, state.devices.length, claimAttempt, registeredAt]);

  /**
   * ensurePlayingHere answers an order that wants sound with nowhere to play:
   * the order came from this device, so the sound is this device's. It goes
   * before the order itself rather than beside it, or the order reaches nobody
   * first, pauses the record and reads as a failure.
   */
  const ensurePlayingHere = useCallback(async () => {
    // A step-back leave this page has in flight settles first: reading the set
    // beside it would see what the leave is about to change, and the two
    // orders would undo each other whichever reached the server last.
    const pending = stepBackPendingRef.current;
    stepBackPendingRef.current = null;
    if (pending) {
      await pending;
    }

    const mine = getMyDeviceId();
    if (!mine || stateRef.current.devices.length > 0) {
      return;
    }
    keptOutRef.current = false;
    await playerClient.devices([mine]);
  }, []);

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
      // Asked again when the moment comes, the way a start is. Clearing the
      // timer is not enough on its own: an order that supersedes this one may
      // never touch the element, and this would then stop what that order had
      // just got playing again.
      waitingRef.current = setTimeout(() => {
        if (current()) {
          audio.pause();
        }
      }, when.wait);
    });
  }, []);

  const loadHere = useCallback(
    async (trackId: string, at: number, startAt: number, cycle: number, current: () => boolean, tries = 0) => {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      const request = ++loadRequestRef.current;
      // The order has been accepted and the element is about to carry it; the
      // step-back reads this as sound on the way rather than none.
      pendingLoadRef.current = request;
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
        if (pendingLoadRef.current === request) {
          pendingLoadRef.current = 0;
        }
        // A start scheduled by the order before this one obeys nothing but its
        // timer, so leaving it armed lets the track this load was replacing
        // come back on its own.
        if (request === loadRequestRef.current && waitingRef.current) {
          clearTimeout(waitingRef.current);
          waitingRef.current = null;
        }
        return;
      }

      if (!current() || request !== loadRequestRef.current) {
        if (pendingLoadRef.current === request) {
          pendingLoadRef.current = 0;
        }
        return;
      }

      loadedRef.current = trackId;
      pendingLoadRef.current = 0;
      cycleRef.current = cycle;
      setHolding(null);
      audio.src = `${config.server.url}/tracks/${trackId}/stream?${params.toString()}`;

      // An element can sit on a source forever without ever saying anything is
      // wrong: no error, nothing buffered, nothing playing, while the audio it
      // is asking for sits on the server perfectly whole. Nothing would ever
      // notice, because everything that recovers is hung on the error it never
      // gets. Being asked for it again is what unsticks it.
      if (stuckRef.current) {
        clearTimeout(stuckRef.current);
      }
      stuckRef.current = setTimeout(() => {
        stuckRef.current = null;
        if (!current() || request !== loadRequestRef.current || audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA || audio.buffered.length > 0) {
          return;
        }
        if (tries >= ASK_AGAIN) {
          console.error('the source never produced anything', audio.src);
          setIsLoading(false);
          toast.error(i18n.t('MusicPlayer.playbackErrorGeneric'));
          playerClient
            .pause()
            .then(apply)
            .catch(() => undefined);
          return;
        }
        void loadHereRef.current(trackId, at, startAt, cycle, current, tries + 1);
      }, NOTHING_YET_MS);
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
      if (userId && tries === 0) {
        const playId = trackPlayCollection.utils.newId();
        currentPlayIdRef.current = playId;
        trackPlayCollection.insert({ id: playId, user: userId, track: trackId, completed: false } as TrackPlay);
      }

      startHere(audio, at, startAt, () => current() && request === loadRequestRef.current);
    },
    [audioFormat, startHere],
  );

  useEffect(() => {
    loadHereRef.current = loadHere;
  }, [loadHere]);

  // What a device missed while its stream was down cannot be handed to it
  // afterwards: the orders went out and nobody heard them. So a device coming
  // back does not ask what happened, it reads what is true and makes itself
  // match, which is the same thing it would have arrived at had it heard
  // everything.
  //
  // The run it is picking up is the moment the playhead was set, which is what
  // the record carries and what an order would have named.
  const reconcile = useCallback(async () => {
    // Read before anything is waited on, and only read: an order arriving while
    // the record is being fetched is newer than this one, and taking the epoch
    // afterwards would invalidate it and then act on what it had replaced.
    // Taking it here would be worse still, since everything below can decline
    // to act and would leave that order cancelled by something that did
    // nothing.
    const before = orderRef.current;

    if (!(await refresh())) {
      // The record could not be read, so what is held says nothing about what
      // happened while the stream was down. Deciding anything on it would be
      // deciding on the state this was meant to replace.
      return;
    }

    if (orderRef.current !== before) {
      return;
    }

    const id = getMyDeviceId();
    const audio = audioRef.current;
    if (!id || !audio || loadedRef.current === null) {
      // A page that has loaded nothing has nothing to catch up on. Its stream
      // registering is it arriving, not it coming back, and making it obey a
      // record that says it was playing is how a reload starts the music on
      // its own.
      return;
    }

    const record = snapshot();
    if (!record.devices.includes(id)) {
      // Not one of the places the sound comes out, and this cannot tell why.
      // Being dropped for a stream that went away and being taken out from
      // another device look the same from here, and putting itself back would
      // undo the second as readily as it repairs the first. Somebody who took
      // this device out meant it; a device dropped on its own is put back by
      // the one thing that knows which happened, the record having nowhere left
      // to play.
      return;
    }

    // An order this device did not hear names a run it is not playing. Being
    // behind the record without one is being behind the record's estimate of
    // where this device has got to, and the device is the one making the sound.
    // Read before the run is taken, since taking it is what loses the answer.
    const overtaken = runOf(record) !== cycleRef.current;

    // Now it acts, so now it is an order.
    const order = ++orderRef.current;
    const current = () => order === orderRef.current;

    if (!record.playing || !record.track) {
      audio.pause();
      // Where it stopped still matters: the element is what the playhead reads
      // while it holds the track, so one left behind by a seek it never heard
      // shows the wrong place for as long as it stays paused.
      const stopped = reached(record.position, record.positionAt, false, serverNow());
      if (loadedRef.current === record.track && overtaken && Math.abs(audio.currentTime - stopped) > ABOUT_THERE) {
        audio.currentTime = stopped;
      }
      return;
    }

    // A run nobody has heard yet has not moved from where it was written.
    const at = reached(record.position, record.positionAt, !record.waiting, serverNow());
    if (loadedRef.current !== record.track || !audio.src) {
      void loadHere(record.track, at, 0, runOf(record), current);
      return;
    }

    cycleRef.current = runOf(record);
    if (overtaken && Math.abs(audio.currentTime - at) > ABOUT_THERE) {
      audio.currentTime = at;
    }
    if (audio.paused) {
      startHere(audio, at, 0, current);
    }
  }, [loadHere, startHere]);

  useEffect(() => {
    reconcileRef.current = () => void reconcile();
  }, [reconcile]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the audio element must only be created once
  useEffect(() => {
    const audio = new Audio();
    audio.volume = localVolume;
    audioRef.current = audio;
    setAudioElement(audio);

    const onTimeUpdate = () => {
      if (Capacitor.isNativePlatform() && audio.duration > 0) {
        void nativeAudioService.setPosition(audio.currentTime, audio.duration);
      }

      const delta = audio.currentTime - lastTimeRef.current;
      if (delta > 0 && delta < 2) {
        listenedRef.current += delta;
      }
      lastTimeRef.current = audio.currentTime;

      if (!audio.paused && delta > 0 && delta < 2 && loadedRef.current && cycleRef.current !== 0 && heardRef.current !== cycleRef.current) {
        const run = cycleRef.current;
        heardRef.current = run;
        void playerClient.position(loadedRef.current, audio.currentTime, run).catch(() => {
          // Said again on the next moment of sound, unless a newer run has
          // taken its place in the meantime.
          if (heardRef.current === run) {
            heardRef.current = 0;
          }
        });
      }

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
      if (stuckRef.current) {
        clearTimeout(stuckRef.current);
        stuckRef.current = null;
      }
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
      if (stuckRef.current) {
        clearTimeout(stuckRef.current);
        stuckRef.current = null;
      }
      setIsLoading(false);
      const src = audio.currentSrc;
      console.error('the stream would not play', audio.error?.code, audio.error?.message, src);
      playerClient
        .pause()
        .then(apply)
        .catch(() => undefined);
      void reasonFor(src).then((reason) => toast.error(reason ?? i18n.t('MusicPlayer.playbackErrorGeneric')));
    };

    // A seek moves the time without anything being heard, and a short one
    // looks like progress: the first-sound report would go out over silence
    // while the new position buffers. Progress is counted from where it landed.
    const onSeeking = () => {
      lastTimeRef.current = audio.currentTime;
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('canplay', stopLoading);
    audio.addEventListener('playing', stopLoading);
    audio.addEventListener('waiting', startLoading);
    audio.addEventListener('error', onError);
    audio.addEventListener('stalled', startLoading);
    audio.addEventListener('seeking', onSeeking);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('canplay', stopLoading);
      audio.removeEventListener('playing', stopLoading);
      audio.removeEventListener('waiting', startLoading);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('stalled', startLoading);
      audio.removeEventListener('seeking', onSeeking);
      if (waitingRef.current) {
        clearTimeout(waitingRef.current);
        waitingRef.current = null;
      }
      if (stuckRef.current) {
        clearTimeout(stuckRef.current);
        stuckRef.current = null;
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
          const from = Number(at) || 0;
          const when = Number(startAt) || 0;
          // Already playing this, at about where it is wanted. Loading it again
          // would take it from the top and land back here, which is a gap the
          // listener hears, and an order that changes nothing for this device
          // is sent whenever the set changes: another device joining says
          // nothing about this one. A moment to start on is different, since
          // devices starting together have to start together.
          if (!when && loadedRef.current === trackId && audio.src && !audio.paused && Math.abs(audio.currentTime - from) < ABOUT_THERE) {
            cycleRef.current = Number(cycle) || 0;
            return;
          }
          void loadHere(trackId, from, when, Number(cycle) || 0, current);
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
          const [, position, cycle] = action.split(':');
          audio.currentTime = Number(position) || 0;
          cycleRef.current = Number(cycle) || 0;
        } else if (action.startsWith('volume:')) {
          setLocalVolume(Number(action.slice(7)) / 100);
        }
      }),
    [loadHere, startHere, stopHere],
  );

  // A speaker reports where it has got to and a browser did not, so the record
  // kept the position of the last order and worked the rest out from how long
  // it had supposedly been playing. That is right until the sound stops without
  // saying so, and then it runs away: a track of four minutes was found seven
  // minutes in, with nothing left to resume from.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playsHere || !state.playing || holding !== state.track || !state.track) {
      return;
    }

    const track = state.track;
    const timer = setInterval(() => {
      if (audio.paused || loadedRef.current !== track) {
        return;
      }
      void playerClient.position(track, audio.currentTime, cycleRef.current).catch(() => undefined);
    }, SAY_WHERE_MS);

    return () => clearInterval(timer);
  }, [playsHere, state.playing, state.track, holding]);

  // Devices told to start together still walk apart, because no two decoders
  // run at quite the same speed. Each one watches its own distance from the
  // record and bends its speed by a thousandth to close it, which is inaudible
  // and needs no leader: they are all following the same written position.
  // Being listed is not playing: a lone device has no peer to correct against.
  const inStepWith = hasPlayingSpeaker(devices, deviceId);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!media || !state.playing || !inStepWith) {
      audio.playbackRate = 1;
      return;
    }

    // The position is read when the correction is made rather than depended on
    // here: a record written while the timer waits would otherwise restart it,
    // and a device losing its turn every time the record moves never corrects.
    const timer = setInterval(() => {
      const record = stateRef.current;
      // The record has nothing to follow until the first sound of the run is
      // reported, and that report is what will anchor it.
      if (record.waiting) {
        return;
      }
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
  }, [media, state.playing, inStepWith]);

  const play = useCallback(
    (tracks: Track[]) => {
      if (tracks.length === 0) {
        return;
      }
      keptOutRef.current = false;
      void send(async () => {
        await ensurePlayingHere();
        return playerClient.play(tracks.map((track) => track.id));
      }, 'MusicPlayer.playbackErrorGeneric');
    },
    [send, ensurePlayingHere],
  );

  const togglePlayPause = useCallback(() => {
    keptOutRef.current = false;
    void send(async () => {
      if (!stateRef.current.playing) {
        await ensurePlayingHere();
      }
      return stateRef.current.playing ? playerClient.pause() : playerClient.resume();
    }, 'MusicPlayer.deviceError');
  }, [send, ensurePlayingHere]);

  const playNext = useCallback(() => {
    keptOutRef.current = false;
    void send(async () => {
      await ensurePlayingHere();
      return playerClient.next();
    }, 'MusicPlayer.deviceError');
  }, [send, ensurePlayingHere]);

  const playPrevious = useCallback(() => {
    keptOutRef.current = false;
    void send(async () => {
      await ensurePlayingHere();
      return playerClient.previous();
    }, 'MusicPlayer.deviceError');
  }, [send, ensurePlayingHere]);

  const skipTo = useCallback(
    (track: Track) => {
      keptOutRef.current = false;
      void send(async () => {
        await ensurePlayingHere();
        return playerClient.skip(track.id);
      }, 'MusicPlayer.deviceError');
    },
    [send, ensurePlayingHere],
  );
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
  // Taking this device out on purpose says it no longer belongs, or putting
  // itself back would undo the order as soon as it was given.
  const playOn = useCallback(
    (next: Device[]) => {
      keptOutRef.current = !next.some((device) => device.id === getMyDeviceId());
      void send(() => playerClient.devices(next.map((device) => device.id)), 'MusicPlayer.deviceError');
    },
    [send],
  );
  const joinDevice = useCallback(
    (device: Device) => {
      if (device.id === getMyDeviceId()) {
        keptOutRef.current = false;
      }
      void send(() => playerClient.join(device.id), 'MusicPlayer.deviceError');
    },
    [send],
  );
  const leaveDevice = useCallback(
    (device: Device) => {
      if (device.id === getMyDeviceId()) {
        keptOutRef.current = true;
      }
      void send(() => playerClient.leave(device.id), 'MusicPlayer.deviceError');
    },
    [send],
  );

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

  useEffect(
    () => () => {
      if (Capacitor.isNativePlatform()) {
        void nativeAudioService.destroy();
      }
    },
    [],
  );

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    // Registering is idempotent; the service keeps only the latest callbacks.
    void nativeAudioService.initialize({ onPlay: togglePlayPause, onPause: togglePlayPause, onNext: playNext, onPrevious: playPrevious, onSeek: seek });
  }, [togglePlayPause, playNext, playPrevious, seek]);

  // The lock screen only offers controls while the plugin hears a playback
  // state: that state starts its foreground service, and the service is what
  // keeps Android from suspending the WebView when the screen locks. With no
  // state sent the audio dies with the screen — the progress freezes and the
  // end of a track never arrives, so nothing advances the queue.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    void nativeAudioService.setPlaybackState(currentTrack ? (state.playing ? 'playing' : 'paused') : 'none');
  }, [state.playing, currentTrack]);

  useEffect(() => {
    if (!currentTrack) {
      return;
    }

    const album = albumsById.get(currentTrack.album);
    const artist = artistNames(currentTrack.artists, artistsById);
    if (Capacitor.isNativePlatform()) {
      void nativeAudioService.setMetadata({ title: currentTrack.title, artist, album: album?.name ?? '', artwork: album ? getAlbumCoverUrl(album) : undefined, duration: currentTrack.duration });
      // The lock screen wants a timeline even for a track sitting paused:
      // timeupdate only comes from playback, so seed it from what is loaded
      // and let the updates take it from there.
      const audio = audioRef.current;
      void nativeAudioService.setPosition(audio?.currentTime ?? 0, currentTrack.duration || audio?.duration || 0);
      return;
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
    isLoading: loading,
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
