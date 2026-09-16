import { universalClient, withMethods } from 'universal-client';
import { withHttpDelegate } from '@/lib/client';
import { config } from '@/lib/config';
import type { ConfigResponse, ServerConfig } from '@/shared';

export const configClient = universalClient(
  withHttpDelegate(config.server.url),
  withMethods(({ http }) => ({
    get: () => http.get<ConfigResponse>('/config'),
    update: (patch: Partial<ServerConfig>) => http.patch<ServerConfig>('/config', patch),
    addressCandidates: () => http.get<{ candidates: string[] }>('/config/address-candidates'),
  })),
);
