import { universalClient, withMethods } from 'universal-client';
import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/config';
import type { PlayerState, RepeatMode, Track } from '@/shared';

export const playerClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => {
    return {
      state: () => http.get<PlayerState>('/player'),
      time: () => http.get<{ now: string }>('/time'),

      play: (tracks: Track['id'][]) => http.post<PlayerState>('/player/play', { tracks }),
      resume: () => http.post<PlayerState>('/player/resume', {}),
      pause: () => http.post<PlayerState>('/player/pause', {}),
      next: () => http.post<PlayerState>('/player/next', {}),
      previous: () => http.post<PlayerState>('/player/previous', {}),
      skip: (trackId: Track['id']) => http.post<PlayerState>('/player/skip', { trackId }),
      ended: (trackId: Track['id'], cycle: number) => http.post<PlayerState>('/player/ended', { trackId, cycle }),
      seek: (position: number) => http.post<PlayerState>('/player/seek', { position }),
      position: (trackId: Track['id'], position: number) => http.post<{ success: boolean }>('/player/position', { trackId, position }),
      add: (trackId: Track['id']) => http.post<PlayerState>('/player/add', { trackId }),
      remove: (trackId: Track['id']) => http.post<PlayerState>('/player/remove', { trackId }),
      clear: () => http.post<PlayerState>('/player/clear', {}),

      shuffle: (shuffle: boolean) => http.post<PlayerState>('/player/shuffle', { shuffle }),
      repeat: (repeat: RepeatMode) => http.post<PlayerState>('/player/repeat', { repeat }),

      devices: (deviceIds: string[]) => http.post<PlayerState>('/player/devices', { deviceIds }),
      join: (deviceId: string) => http.post<PlayerState>('/player/join', { deviceId }),
      leave: (deviceId: string) => http.post<PlayerState>('/player/leave', { deviceId }),
    };
  }),
);
