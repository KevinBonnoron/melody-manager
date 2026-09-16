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
  const onSpeaker = activeDevice !== null && isNetworkDevice(activeDevice);
  const liveRef = useRef({ isPlaying: isPlaying && !isLoading, trackId, position: currentTime, volume, onSpeaker });
  liveRef.current = { isPlaying: isPlaying && !isLoading, trackId, position: currentTime, volume, onSpeaker };

  useEffect(() => {
    if (onSpeaker || !currentTrack || currentTime <= 0) {
      return;
    }

    const now = Date.now();
    const trackChanged = currentTrack.id !== lastTrackIdRef.current;
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

  useEffect(() => subscribeDevices(() => undefined), []);

  const report = useCallback((released = false) => {
    const deviceId = getMyDeviceId();
    if (!deviceId) {
      return;
    }

    const { isPlaying: playing, trackId: id, position, volume: level } = liveRef.current;
    const gone = released || liveRef.current.onSpeaker;
    const state = { trackId: gone ? '' : id, playing: gone ? false : playing, position: gone ? 0 : position, volume: Math.round(level * 100) };

    if (lastSentRef.current === null && !state.trackId && !state.playing) {
      return;
    }

    const sent = JSON.stringify(state);
    if (sent === lastSentRef.current) {
      return;
    }

    lastSentRef.current = sent;
    deviceClient.reportState(deviceId, state).catch(() => {
      lastSentRef.current = null;
      reconnect();
    });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the values are read from a ref, these deps are the change signal
  useEffect(() => {
    report();
  }, [report, isPlaying, isLoading, trackId, onSpeaker]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the value is read from a ref, volume is the change signal
  useEffect(() => {
    const timer = setTimeout(report, VOLUME_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [report, volume]);

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

  useEffect(
    () =>
      subscribeRegistration(() => {
        lastSentRef.current = null;
        report();
      }),
    [report],
  );

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
          const [, handedTrackId, handedPosition] = action.split(':');
          const at = Number(handedPosition) || 0;
          const handed = trackCollection.get(handedTrackId) as Track | undefined;
          if (handed) {
            playTrack(handed, at);
          } else {
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
