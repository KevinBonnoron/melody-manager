import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ProviderIcon } from '@/components/providers/provider-info';
import { useAuthUser } from '@/hooks/use-auth-user';
import { getSourceColor } from '@/lib/source-colors';
import type { Provider } from '@/shared';

export function OffDeviceCard({ provider, title, subtitle, icon: Icon, onConfigure }: { provider: Provider; title: string; subtitle?: string; icon: ProviderIcon; onConfigure: () => void }) {
  const { t } = useTranslation();
  const user = useAuthUser();
  const isAdmin = user.role === 'admin';

  return (
    <div className="group flex items-center gap-2 rounded-xl border bg-transparent p-3.5 transition-colors hover:border-[var(--plat)] hover:bg-card" style={{ '--plat': getSourceColor(provider.type) } as React.CSSProperties}>
      <button type="button" onClick={isAdmin ? onConfigure : undefined} disabled={!isAdmin} aria-label={t('DevicesPage.settings', { title })} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default">
        <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-[var(--plat)] text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.3)]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{title}</div>
          {subtitle && <div className="truncate text-[11.5px] text-muted-foreground">{subtitle}</div>}
        </div>
        {isAdmin && (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/[0.05] text-muted-foreground transition-colors group-hover:bg-[var(--plat)] group-hover:text-white">
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </span>
        )}
      </button>
    </div>
  );
}
