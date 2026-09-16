import { eq, useLiveQuery } from '@tanstack/react-db';
import { deviceClient } from '@/clients/device.client';
import { trackCollection } from '@/collections/track.collection';
import { useMusicPlayer } from '@/contexts/music-player-context';
import type { Track } from '@/shared';
import { remoteTarget } from './remote-target';
import { useDevices } from './use-devices';
import { useReportedPosition } from './use-reported-position';

export function useRemotePlayback() {
  const { activeDevice } = useMusicPlayer();
  const { devices, playingElsewhere } = useDevices();

  const remoteActive = remoteTarget(activeDevice, devices, playingElsewhere);

  const playing = remoteActive?.playing ?? false;
  const position = useReportedPosition(remoteActive);
  const trackId = remoteActive?.trackId ?? '';
  const { data: rows = [] } = useLiveQuery({ query: (q) => q.from({ tracks: trackCollection }).where(({ tracks }) => eq(tracks.id, trackId)) });

  if (!remoteActive) {
    return null;
  }

  const track = (rows as unknown as Track[])[0];

  return {
    device: remoteActive,
    track,
    isPlaying: playing,
    currentTime: Math.min(track?.duration ?? Number.POSITIVE_INFINITY, position),
    duration: track?.duration ?? 0,
    togglePlayPause: () => (playing ? deviceClient.pause(remoteActive.id) : deviceClient.play(remoteActive.id)),
    playNext: () => deviceClient.next(remoteActive.id),
    playPrevious: () => deviceClient.previous(remoteActive.id),
    seek: (time: number) => deviceClient.seek(remoteActive.id, Math.round(time)),
    volume: (remoteActive.volume ?? 100) / 100,
    setVolume: (level: number) => deviceClient.setVolume(remoteActive.id, Math.round(level * 100)),
    stop: () => deviceClient.stop(remoteActive.id),
  };
}
