import { useLiveQuery } from '@tanstack/react-db';
import { useCallback, useMemo } from 'react';
import { providerConfigCollection } from '@/collections/provider-config.collection';
import type { ProviderConfig } from '@/shared';
import { useDevices } from './use-devices';

export interface ConfiguredSpeaker {
  address: string;
  enabled: boolean;
}

function speakersIn(config: ProviderConfig['config'] | undefined): ConfiguredSpeaker[] {
  return ((config?.speakers as ConfiguredSpeaker[] | undefined) ?? []).filter((s) => typeof s?.address === 'string');
}

const writing = new Map<string, Promise<unknown>>();

function applySpeakers(type: string, change: (current: ConfiguredSpeaker[]) => ConfiguredSpeaker[]): Promise<void> {
  const next = (writing.get(type) ?? Promise.resolve()).then(async () => {
    const config = providerConfigCollection.toArray.find((c) => c.type === type);
    if (config) {
      await providerConfigCollection.update(config.id, (draft) => {
        draft.config = { ...draft.config, speakers: change(speakersIn(draft.config)) };
      }).isPersisted.promise;
      return;
    }

    await providerConfigCollection.insert({ id: providerConfigCollection.utils.newId(), type, config: { speakers: change([]) } } as unknown as ProviderConfig).isPersisted.promise;
  });

  writing.set(
    type,
    next.catch(() => undefined),
  );
  return next;
}

export function useSpeakers(type: string) {
  const { data: configs = [] } = useLiveQuery({ query: (q) => q.from({ configs: providerConfigCollection }) });
  const config = useMemo(() => (configs as ProviderConfig[]).find((c) => c.type === type), [configs, type]);
  const speakers = useMemo(() => speakersIn(config?.config), [config]);

  const apply = useCallback((change: (current: ConfiguredSpeaker[]) => ConfiguredSpeaker[]) => applySpeakers(type, change), [type]);

  const write = useCallback((next: ConfiguredSpeaker[]) => apply(() => next), [apply]);

  const decide = useCallback((address: string, enabled: boolean) => apply((current) => (current.some((s) => s.address === address) ? current.map((s) => (s.address === address ? { ...s, enabled } : s)) : [...current, { address, enabled }])), [apply]);

  const forget = useCallback((address: string) => apply((current) => current.filter((s) => s.address !== address)), [apply]);

  return { speakers, apply, write, decide, forget, configId: config?.id };
}

export function useUndecidedSpeakers() {
  const { data: configs = [] } = useLiveQuery({ query: (q) => q.from({ configs: providerConfigCollection }) });
  const { speakers: live } = useDevices();

  return useMemo(() => {
    const decided = new Map<string, Set<string>>();
    for (const config of configs as ProviderConfig[]) {
      decided.set(config.type, new Set(speakersIn(config.config).map((s) => s.address)));
    }

    return live.filter((device) => !decided.get(device.type)?.has(device.ipAddress));
  }, [configs, live]);
}
