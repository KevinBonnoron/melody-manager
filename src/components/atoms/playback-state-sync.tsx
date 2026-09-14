import { useCallback, useEffect, useRef } from 'react';
import { deviceClient } from '@/clients/device.client';
import { trackCollection } from '@/collections/track.collection';
import { useMusicPlayer } from '@/contexts/music-player-context';
import { useDevices } from '@/hooks/use-devices';
import { usePlaybackState } from '@/hooks/use-playback-state';
import { getMyDeviceId, reconnect, subscribeCommands, subscribeDevices, subscribeRegistration } from '@/lib/device-presence';
import { pb } from '@/lib/pocketbase';
import { isNetworkDevice, type Track } from '@/shared';

const SAVE_INTERVAL_MS = 15_000;
const VOLUME_DEBOUNCE_MS = 400;

export function PlaybackStateSync() {
  const { currentTrack, isPlaying, isLoading, currentTime, queue, activeDevice, togglePlayPause, playNext, playPrevious, seek, setVolume, volume, audioElement, playTrack } = useMusicPlayer();
  const { save, flush } = usePlaybackState();
  const { others } = useDevices();
  const othersRef = useRef(others);
  othersRef.current = others;
  const lastSaveRef = useRef(0);
  const lastSentRef = useRef<string | null>(null);
  const wasPlayingRef = useRef(isPlaying);
  const lastTrackIdRef = useRef<string | null>(null);
  const trackId = currentTrack?.id ?? '';
  // Driving a speaker is not playing: the sound comes out of it, not of here,
  // and a client that claimed the track anyway would show up on the others as
  // the one holding playback.
  const onSpeaker = activeDevice !== null && isNetworkDevice(activeDevice);
  // A client still fetching its audio is not playing yet, whatever it intends:
  // the position is not moving, so another client told otherwise counts through
  // the wait and ends up ahead of the sound.
  const liveRef = useRef({ isPlaying: isPlaying && !isLoading, trackId, position: currentTime, volume, onSpeaker });
  liveRef.current = { isPlaying: isPlaying && !isLoading, trackId, position: currentTime, volume, onSpeaker };

  useEffect(() => {
    // A speaker plays without this browser, and the server watches it: it
    // writes the resume point itself, from the position it polls. Writing it
    // from here too would be two authors for one row, the second of which is
    // not playing anything.
    if (onSpeaker || !currentTrack || currentTime <= 0) {
      return;
    }

    const now = Date.now();
    const trackChanged = currentTrack.id !== lastTrackIdRef.current;
    // Stopping is the moment a listener will want back, so it is written at
    // once. The guard used to be skipped for the whole time playback was
    // stopped rather than for that one moment, which wrote on every tick.
    const justStopped = wasPlayingRef.current && !isPlaying;
    wasPlayingRef.current = isPlaying;
    if (!trackChanged && !justStopped && now - lastSaveRef.current < SAVE_INTERVAL_MS) {
      return;
    }

    lastSaveRef.current = now;
    lastTrackIdRef.current = currentTrack.id;
    save(
      currentTrack.id,
      currentTime,
      queue.map((track) => track.id),
    );
  }, [onSpeaker, currentTrack, currentTime, isPlaying, queue, save]);

  // A page being unloaded has no time for the normal write path, and losing it
  // is exactly what makes a resume land seconds off.
  useEffect(() => {
    const flushNow = () => {
      const { trackId: id, position } = liveRef.current;
      if (id && position > 0) {
        flush(id, position);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushNow();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushNow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushNow);
    };
  }, [flush]);

  // Holding the stream open is what keeps this client listed, so it is opened
  // for as long as the player is mounted rather than only when something reads
  // the device list.
  useEffect(() => subscribeDevices(() => undefined), []);

  const report = useCallback((released = false) => {
    const deviceId = getMyDeviceId();
    if (!deviceId) {
      return;
    }

    const { isPlaying: playing, trackId: id, position, volume: level } = liveRef.current;
    // Releasing advertises no track at all: pausing keeps the session here,
    // handing over gives it up, and only the holder should be shown elsewhere.
    const gone = released || liveRef.current.onSpeaker;
    const state = { trackId: gone ? '' : id, playing: gone ? false : playing, position: gone ? 0 : position, volume: Math.round(level * 100) };

    // A client that has said nothing yet and holds nothing has nothing to say:
    // a freshly registered device already reads as empty on the server, so the
    // report that used to go out on connecting only repeated it.
    if (lastSentRef.current === null && !state.trackId && !state.playing) {
      return;
    }

    // Several things signal the same moment: starting playback changes
    // `isPlaying` and makes the audio element fire `playing`, and mounting
    // triggers the volume timer as well. Each is worth listening to, none is
    // worth a second identical message, so the last one sent is the guard.
    const sent = JSON.stringify(state);
    if (sent === lastSentRef.current) {
      return;
    }

    lastSentRef.current = sent;
    deviceClient.reportState(deviceId, state).catch(() => {
      // The server no longer knows this device: the stream behind it is gone.
      // Nothing was recorded, so the next attempt must not be taken for a repeat.
      lastSentRef.current = null;
      reconnect();
    });
  }, []);

  // The other clients count the position forward themselves, so only actual
  // changes are worth pushing, no periodic beat.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the values are read from a ref, these deps are the change signal
  useEffect(() => {
    report();
  }, [report, isPlaying, isLoading, trackId, onSpeaker]);

  // Dragging the volume slider emits a change per pixel; only where it lands is
  // worth telling the other clients about.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the value is read from a ref, volume is the change signal
  useEffect(() => {
    const timer = setTimeout(report, VOLUME_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [report, volume]);

  // A seek moves the position without changing anything else, so the tick that
  // carries it is indistinguishable from playback unless the jump says so. And
  // `playing` is where the sound actually resumes: reporting only the intended
  // start leaves the other clients counting through the buffering.
  useEffect(() => {
    if (!audioElement) {
      return;
    }

    const onAudioEvent = () => report();
    for (const event of ['seeked', 'playing']) {
      audioElement.addEventListener(event, onAudioEvent);
    }

    return () => {
      for (const event of ['seeked', 'playing']) {
        audioElement.removeEventListener(event, onAudioEvent);
      }
    };
  }, [audioElement, report]);

  // Playback is exclusive across a user's clients: starting here silences
  // whichever one was playing, the way picking a device does.
  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    for (const device of othersRef.current) {
      if (device.playing) {
        deviceClient.stop(device.id).catch(() => undefined);
      }
    }
  }, [isPlaying]);

  // A fresh registration means the server knows nothing of this client, so what
  // it was last told no longer counts.
  useEffect(
    () =>
      subscribeRegistration(() => {
        lastSentRef.current = null;
        report();
      }),
    [report],
  );

  // Transport commands routed here by the server on behalf of another client.
  useEffect(
    () =>
      subscribeCommands((command) => {
        if (command.deviceId !== getMyDeviceId()) {
          return;
        }

        const playing = liveRef.current.isPlaying;
        const action = command.action;
        if (action === 'stop') {
          if (playing) {
            togglePlayPause();
          }

          report(true);
        } else if (action === 'pause' && playing) {
          togglePlayPause();
        } else if (action === 'play' && !playing) {
          togglePlayPause();
        } else if (action.startsWith('play:')) {
          // Another client handed its playback over: same track, same spot.
          const [, handedTrackId, handedPosition] = action.split(':');
          const at = Number(handedPosition) || 0;
          const handed = trackCollection.get(handedTrackId) as Track | undefined;
          if (handed) {
            playTrack(handed, at);
          } else {
            // A device can name a track this client has not synced yet. The
            // sender has already stopped its own playback by now, so giving up
            // here would stop the sound everywhere with nothing to show for it.
            pb.collection('tracks')
              .getOne<Track>(handedTrackId)
              .then((fetched) => playTrack(fetched, at))
              .catch((error) => console.error('handed a track this client cannot read', error));
          }
        } else if (action === 'next') {
          playNext();
        } else if (action === 'previous') {
          playPrevious();
        } else if (action.startsWith('seek:')) {
          seek(Number(action.slice(5)));
        } else if (action.startsWith('volume:')) {
          setVolume(Number(action.slice(7)) / 100);
        }
      }),
    [togglePlayPause, playNext, playPrevious, seek, setVolume, playTrack, report],
  );

  return null;
}
