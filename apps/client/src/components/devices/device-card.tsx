import { Link } from '@tanstack/react-router';
import { type LucideIcon, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { providerCollection } from '@/collections/provider.collection';
import type { ProviderIcon } from '@/components/providers/provider-info';
import { RemoveProviderConfigDialog } from '@/components/providers/remove-provider-config-dialog';
import { Button } from '@/components/ui/button';
import { useAuthUser } from '@/hooks/use-auth-user';
import { useSpeakers } from '@/hooks/use-speakers';
import { getSourceColor } from '@/lib/source-colors';
import { cn } from '@/lib/utils';
import type { Provider } from '@/shared';

export function DeviceCard({ provider, title, icon: Icon, found, onConfigure }: { provider: Provider; title: string; icon: ProviderIcon; found: number; onConfigure: () => void }) {
  const { t } = useTranslation();
  const user = useAuthUser();
  const isAdmin = user.role === 'admin';
  const { speakers, configId } = useSpeakers(provider.type);
  const [removeOpen, setRemoveOpen] = useState(false);
  const color = getSourceColor(provider.type);

  const turnOff = async () => {
    await providerCollection.update(provider.id, (draft) => {
      draft.enabled = false;
    }).isPersisted.promise;
  };

  return (
    <div className="relative flex flex-col gap-3.5 rounded-xl border bg-card px-[18px] pt-[18px] pb-4 transition-colors hover:border-[var(--plat)]" style={{ '--plat': color } as React.CSSProperties}>
      <div className="flex flex-col gap-1.5">
        <Link to="/devices/$type" params={{ type: provider.type }} className="flex min-w-0 items-center gap-3 after:absolute after:inset-0 after:content-['']">
          <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.3),0_1px_2px_rgba(0,0,0,0.3)]" style={{ backgroundColor: color }}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 truncate text-[15px] font-semibold">{title}</div>
        </Link>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={provider.enabled ? 'h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_6px_var(--success)]' : 'h-1.5 w-1.5 rounded-full bg-muted-foreground/50'} />
          {provider.enabled ? t('DevicesPage.on') : t('DevicesPage.off')}
        </div>
      </div>

      <div className="flex gap-6 border-y pt-2.5 pb-2">
        <Metric value={found} label={t('DevicesPage.answering')} />
        <Metric value={speakers.length} label={t('DevicesPage.known')} />
      </div>

      <div className="relative flex items-center justify-end gap-1">
        {isAdmin && <CardAction icon={SlidersHorizontal} label={t('DevicesPage.settings', { title })} onClick={onConfigure} />}
        {isAdmin && configId && <CardAction icon={Trash2} label={t('ProviderCardActions.removeServerSettings')} destructive onClick={() => setRemoveOpen(true)} />}
      </div>

      {configId && <RemoveProviderConfigDialog configId={configId} title={title} open={removeOpen} onOpenChange={setRemoveOpen} beforeDelete={turnOff} />}
    </div>
  );
}

function CardAction({ icon: Icon, label, destructive = false, onClick }: { icon: LucideIcon; label: string; destructive?: boolean; onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" className={cn('h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground', destructive && 'hover:bg-destructive/10 hover:text-destructive')} onClick={onClick} aria-label={label} title={label}>
      <Icon className="h-4 w-4" />
    </Button>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-sm font-semibold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
    </div>
  );
}
