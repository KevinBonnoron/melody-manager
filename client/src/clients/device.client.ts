import type { Device } from '@melody-manager/shared';
import { universalClient, withMethods } from 'universal-client';
import { withHttpDelegate, withSseDelegate } from '@/lib/client';
import { config } from '@/lib/config';

export const deviceClient = universalClient(
  withHttpDelegate(config.server.url),
  withSseDelegate(config.server.url),
  withMethods(({ http, sse }) => {
    return {
      list: () => http.get<{ success: boolean; data: Device[] }>('/devices'),

      events: (onDevices: (devices: Device[]) => void) => {
        return sse.subscribe('/devices/events', (data) => {
          if (typeof data === 'string') {
            onDevices(JSON.parse(data));
          }
        });
      },

      play: (deviceId: string, trackId?: string) => (trackId ? http.post(`/devices/${deviceId}/play/${trackId}`, {}) : http.post(`/devices/${deviceId}/play`, {})),
      pause: (deviceId: string) => http.post(`/devices/${deviceId}/pause`, {}),
      stop: (deviceId: string) => http.post(`/devices/${deviceId}/stop`, {}),
      next: (deviceId: string) => http.post(`/devices/${deviceId}/next`, {}),
      previous: (deviceId: string) => http.post(`/devices/${deviceId}/previous`, {}),
      seek: (deviceId: string, position: number) => http.post(`/devices/${deviceId}/seek`, { position }),
      setVolume: (deviceId: string, volume: number) => http.post(`/devices/${deviceId}/volume`, { volume }),
      getState: (deviceId: string) => http.get<{ success: boolean; data: { state: string; track: unknown; volume: number } }>(`/devices/${deviceId}/state`),
      addToQueue: (deviceId: string, trackId: string) => http.post(`/devices/${deviceId}/queue/${trackId}`, {}),
      clearQueue: (deviceId: string) => http.delete(`/devices/${deviceId}/queue`),
    };
  }),
);
