import { Speaker, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePageHeader } from '@/components/layout/page-header';
import { getProviderInfoFromManifests } from '@/components/providers/provider-info';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useAuthUser } from '@/hooks/use-auth-user';
import { useDeviceProviders } from '@/hooks/use-device-providers';
import { useDevices } from '@/hooks/use-devices';
import { usePlugins } from '@/hooks/use-plugins';
import { useSpeakers } from '@/hooks/use-speakers';
import { cn } from '@/lib/utils';

export function DevicePage({ type }: { type: string }) {
  const { t } = useTranslation();
  const user = useAuthUser();
  const isAdmin = user.role === 'admin';
  const { manifests } = usePlugins();
  const deviceProviders = useDeviceProviders();
  const { speakers: live } = useDevices();
  const { speakers, decide, forget } = useSpeakers(type);

  const provider = deviceProviders.find((p) => p.type === type);
  const providerInfo = useMemo(() => getProviderInfoFromManifests(t, manifests), [t, manifests]);
  const title = providerInfo[type]?.title ?? type;
  const present = useMemo(() => live.filter((s) => s.type === type), [live, type]);
  const answering = useMemo(() => new Set(present.map((s) => s.ipAddress)), [present]);

  const rows = useMemo(() => {
    const decided = new Map(speakers.map((s) => [s.address, s]));
    for (const device of present) {
      if (!decided.has(device.ipAddress)) {
        decided.set(device.ipAddress, { address: device.ipAddress, enabled: false });
      }
    }

    return [...decided.values()];
  }, [speakers, present]);

  usePageHeader({ title, description: t('DevicesPage.foundBy', { title }) });

  const save = async (change: Promise<void>) => {
    try {
      await change;
    } catch (error) {
      console.error(error);
      toast.error(t('DevicesPage.saveError'));
    }
  };

  if (!provider) {
    return <p className="text-muted-foreground text-sm">{t('DevicesPage.unknownKind')}</p>;
  }

  if (!provider.enabled) {
    return <p className="text-muted-foreground text-sm">{t('DevicesPage.turnedOff', { title })}</p>;
  }

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('DevicesPage.noSpeakers')}</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((speaker) => {
        const found = answering.has(speaker.address);
        return (
          <li key={speaker.address} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
            <Speaker className={cn('h-4 w-4 shrink-0', found ? 'text-primary' : 'text-muted-foreground')} />
            <div className="min-w-0 flex-1">
              <div className={cn('font-mono text-[13px]', !speaker.enabled && 'text-muted-foreground line-through')}>{speaker.address}</div>
              <div className="text-[11.5px] text-muted-foreground">{found ? t('DevicesPage.answering') : t('DevicesPage.silent')}</div>
            </div>
            <Switch checked={speaker.enabled} disabled={!isAdmin} aria-label={t('DevicesPage.useSpeaker', { address: speaker.address })} onCheckedChange={(enabled) => save(decide(speaker.address, enabled))} />
            <span title={found ? t('DevicesPage.cannotForget') : undefined}>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" disabled={!isAdmin || found} aria-label={t('DevicesPage.forget', { address: speaker.address })} onClick={() => save(forget(speaker.address))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
