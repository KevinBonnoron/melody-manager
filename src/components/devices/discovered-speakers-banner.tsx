import { Speaker } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useSpeakers } from '@/hooks/use-speakers';
import type { NetworkDevice } from '@/shared';

export function DiscoveredSpeakersBanner({ type, title, found, onConfigure }: { type: string; title: string; found: NetworkDevice[]; onConfigure: () => void }) {
  const { t } = useTranslation();
  const { apply } = useSpeakers(type);

  const ignore = async () => {
    try {
      await apply((current) => {
        const known = new Set(current.map((speaker) => speaker.address));
        return [...current, ...found.filter((device) => !known.has(device.ipAddress)).map((device) => ({ address: device.ipAddress, enabled: false }))];
      });
    } catch (error) {
      console.error(error);
      toast.error(t('DevicesPage.saveError'));
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-primary/40 bg-primary/[0.06] px-4 py-3.5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-primary/15 text-primary">
        <Speaker className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{t('DevicesPage.discovered', { count: found.length, title })}</div>
        <div className="truncate font-mono text-[11.5px] text-muted-foreground">{found.map((device) => device.name || device.ipAddress).join(', ')}</div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" size="sm" onClick={ignore}>
          {t('DevicesPage.ignoreDiscovered')}
        </Button>
        <Button size="sm" onClick={onConfigure}>
          {t('DevicesPage.configureDiscovered')}
        </Button>
      </div>
    </div>
  );
}
