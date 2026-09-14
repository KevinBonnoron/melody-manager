import { useLiveQuery } from '@tanstack/react-db';
import { useCallback, useMemo } from 'react';
import { providerConfigCollection } from '@/collections/provider-config.collection';
import type { ProviderConfig } from '@/shared';
import { useDevices } from './use-devices';

// One address and whether the server may use it.
//
// Two states rather than a bare list, because removing a speaker discovery can
// see achieves nothing: the next pass puts it straight back. Forgetting one says
// "I do not have this", and discovery may well disagree tomorrow. Disabling one
// says "do not use this", which is the answer for a neighbour's speaker, and
// discovery leaves it alone from then on.
export interface ConfiguredSpeaker {
  address: string;
  enabled: boolean;
}

function speakersIn(config: ProviderConfig['config'] | undefined): ConfiguredSpeaker[] {
  return ((config?.speakers as ConfiguredSpeaker[] | undefined) ?? []).filter((s) => typeof s?.address === 'string');
}

// One write at a time per source, each reading the list as it stands when its
// turn comes rather than as it stood when a screen last rendered. Two decisions
// taken between one render and the next each carried their own copy otherwise:
// with a row already there the second put back what the first had changed, and
// with no row yet both took the create path, where the unique index on type
// refuses one of them and the change it carried is lost.
//
// Outside the hook on purpose. The banner and the page are different components
// holding different instances of it, and they write the same list.
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

// The speakers a device source knows about, found or typed. Both the card that
// configures the source and the screen that lists what it found read them from
// here, so there is one list and one way of writing it.
export function useSpeakers(type: string) {
  const { data: configs = [] } = useLiveQuery({ query: (q) => q.from({ configs: providerConfigCollection }) });
  const config = useMemo(() => (configs as ProviderConfig[]).find((c) => c.type === type), [configs, type]);
  const speakers = useMemo(() => speakersIn(config?.config), [config]);

  const apply = useCallback((change: (current: ConfiguredSpeaker[]) => ConfiguredSpeaker[]) => applySpeakers(type, change), [type]);

  // Assigning the whole list, for the dialog, which is a form: what it shows is
  // what it means to save, every row of it.
  const write = useCallback((next: ConfiguredSpeaker[]) => apply(() => next), [apply]);

  // One speaker at a time, for the screens where a control acts on a row. Each
  // is rebased on what is stored, so deciding about one says nothing about any
  // other.
  const decide = useCallback((address: string, enabled: boolean) => apply((current) => (current.some((s) => s.address === address) ? current.map((s) => (s.address === address ? { ...s, enabled } : s)) : [...current, { address, enabled }])), [apply]);

  const forget = useCallback((address: string) => apply((current) => current.filter((s) => s.address !== address)), [apply]);

  return { speakers, apply, write, decide, forget, configId: config?.id };
}

// The speakers answering on the network that nobody has decided about yet.
// Discovery runs whatever the operator wants, so finding one is not agreeing to
// play to it: until an admin says, it sits here and the screens ask them to
// look. Reads provider_config, which only an admin may, so a regular user sees
// an empty list rather than everything.
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
