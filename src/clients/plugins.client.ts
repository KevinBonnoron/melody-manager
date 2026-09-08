import { universalClient, withMethods } from 'universal-client';
import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/config';
import type { PluginManifest } from '@/shared';

export const pluginsClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => {
    return {
      list: () => http.get<PluginManifest[]>('/plugins'),
    };
  }),
);
