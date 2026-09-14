import { Speaker } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageHeader } from '@/components/layout/page-header';
import { getProviderInfoFromManifests } from '@/components/providers/provider-info';
import { useAuthUser } from '@/hooks/use-auth-user';
import { useDeviceProviders } from '@/hooks/use-device-providers';
import { useDevices } from '@/hooks/use-devices';
import { usePlugins } from '@/hooks/use-plugins';
import { useUndecidedSpeakers } from '@/hooks/use-speakers';
import { getSourceColor } from '@/lib/source-colors';
import { DeviceCard } from './device-card';
import { DiscoveredSpeakersBanner } from './discovered-speakers-banner';
import { OffDeviceCard } from './off-device-card';
import { SpeakerAddressesDialog } from './speaker-addresses-dialog';

// The shape the sources screen has: a summary, the ones in service as cards, and
// the ones that are not below. A device kind is not connected but switched on,
// so that is what the second section offers.
export function DevicesPage() {
  const { t } = useTranslation();
  const { manifests } = usePlugins();
  const deviceProviders = useDeviceProviders();
  const { speakers } = useDevices();
  const user = useAuthUser();
  const undecided = useUndecidedSpeakers();
  const providerInfo = useMemo(() => getProviderInfoFromManifests(t, manifests), [t, manifests]);

  const on = useMemo(() => deviceProviders.filter((p) => p.enabled), [deviceProviders]);
  const off = useMemo(() => deviceProviders.filter((p) => !p.enabled), [deviceProviders]);

  // Held here rather than in the cards: the switch inside the dialog moves the
  // card from one section to the other, which unmounts it. A dialog owned by the
  // card would go with it, in the middle of being used.
  const [configuring, setConfiguring] = useState<string | null>(null);
  const configured = deviceProviders.find((p) => p.type === configuring);

  // Admin only, and not because of the buttons: only an admin can read what has
  // already been decided, so for anyone else every speaker would look new.
  const toReview = useMemo(() => {
    if (user.role !== 'admin') {
      return [];
    }

    return deviceProviders.map((provider) => ({ provider, found: undecided.filter((device) => device.type === provider.type) })).filter((entry) => entry.found.length > 0);
  }, [deviceProviders, undecided, user.role]);

  usePageHeader({ title: t('DevicesPage.title'), description: t('DevicesPage.description') });

  if (deviceProviders.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('DevicesPage.none')}</p>;
  }

  return (
    <div>
      {toReview.map(({ provider, found }) => (
        <DiscoveredSpeakersBanner key={provider.id} type={provider.type} title={providerInfo[provider.type]?.title ?? provider.type} found={found} onConfigure={() => setConfiguring(provider.type)} />
      ))}

      <div className="mb-7 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-[20px] border bg-card px-6 py-[22px]">
        <SummaryStat value={on.length} label={t('DevicesPage.activeKinds')} />
        <SummaryStat value={speakers.length} label={t('DevicesPage.foundDevices')} />
        <div className="ml-auto flex gap-2">
          {on.map((provider) => {
            const Icon = providerInfo[provider.type]?.icon ?? Speaker;
            return (
              <div key={provider.id} className="grid h-8 w-8 place-items-center rounded-[10px] text-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]" style={{ backgroundColor: getSourceColor(provider.type) }} title={providerInfo[provider.type]?.title ?? provider.type}>
                <Icon className="h-4 w-4" />
              </div>
            );
          })}
        </div>
      </div>

      {on.length > 0 && (
        <section className="mb-7">
          <h3 className="mb-3 text-sm font-semibold">{t('DevicesPage.activeSection')}</h3>
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
            {on.map((provider) => (
              <DeviceCard key={provider.id} provider={provider} title={providerInfo[provider.type]?.title ?? provider.type} icon={providerInfo[provider.type]?.icon ?? Speaker} found={speakers.filter((s) => s.type === provider.type).length} onConfigure={() => setConfiguring(provider.type)} />
            ))}
          </div>
        </section>
      )}

      {off.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold">{t('DevicesPage.addSection')}</h3>
          <p className="mt-1 mb-3 text-[13px] text-muted-foreground">{t('DevicesPage.addSectionDescription')}</p>
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
            {off.map((provider) => (
              <OffDeviceCard key={provider.id} provider={provider} title={providerInfo[provider.type]?.title ?? provider.type} subtitle={providerInfo[provider.type]?.description} icon={providerInfo[provider.type]?.icon ?? Speaker} onConfigure={() => setConfiguring(provider.type)} />
            ))}
          </div>
        </section>
      )}

      {configured && <SpeakerAddressesDialog provider={configured} title={providerInfo[configured.type]?.title ?? configured.type} open onOpenChange={(next) => !next && setConfiguring(null)} />}
    </div>
  );
}

function SummaryStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[28px] font-semibold leading-none tabular-nums">{value.toLocaleString()}</div>
      <div className="text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
    </div>
  );
}
