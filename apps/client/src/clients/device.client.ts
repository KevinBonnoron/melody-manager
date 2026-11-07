import { universalClient, withMethods } from 'universal-client';
import { sseAuth, withHttpDelegate, withSseDelegate } from '@/lib/client';
import { config } from '@/lib/config';
import { type Device, type DeviceType, SERVER_EVENTS, type ServerEventName, type ServerEventPayloads } from '@/shared';

export const deviceClient = universalClient(
  withHttpDelegate(config.server.url),
  withSseDelegate(config.server.url),
  withMethods(({ http, sse }) => {
    return {
      list: () => http.get<{ success: boolean; data: Device[] }>('/devices'),

      events: (identity: { type: DeviceType; session: string; name: string; volume: number }, handlers: { [K in ServerEventName]: (payload: ServerEventPayloads[K]) => void }, onBroken?: () => void) => {
        const unsubscribes: Array<() => void> = Object.values(SERVER_EVENTS).map((name) =>
          sse.subscribe(name, (raw) => {
            if (typeof raw !== 'string') {
              return;
            }

            try {
              const payload = JSON.parse(raw);
              if (import.meta.env.DEV) {
                console.debug(`[events] ${name}`, payload);
              }

              (handlers[name] as (value: unknown) => void)(payload);
            } catch (error) {
              console.error(`Failed to parse the "${name}" event:`, error);
            }
          }),
        );

        if (onBroken) {
          unsubscribes.push(sse.onError(onBroken));
        }

        sse.open({ url: '/events', ...sseAuth(), body: identity });
        return () => {
          for (const unsubscribe of unsubscribes) {
            unsubscribe();
          }

          sse.close();
        };
      },

      setVolume: (deviceId: string, volume: number) => http.post(`/devices/${deviceId}/volume`, { volume }),
    };
  }),
);
