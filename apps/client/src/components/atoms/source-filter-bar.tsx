import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveSources } from '@/hooks/use-active-sources';
import { usePlugins } from '@/hooks/use-plugins';
import { getSourceColor } from '@/lib/source-colors';
import { cn } from '@/lib/utils';
import { getProviderInfoFromManifests } from '../providers/provider-info';

interface Props {
  value: string;
  onChange: (source: string) => void;
}

export function SourceFilterBar({ value, onChange }: Props) {
  const { t } = useTranslation();
  const { manifests } = usePlugins();
  const { active: activeProviders } = useActiveSources();
  const providerInfo = useMemo(() => getProviderInfoFromManifests(t, manifests), [t, manifests]);

  if (activeProviders.length <= 1) {
    return null;
  }

  return (
    <div className="flex gap-1.5 flex-wrap">
      <button
        type="button"
        className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all', value === 'all' ? 'bg-primary-soft border-primary text-primary' : 'bg-card border-border text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground')}
        onClick={() => onChange('all')}
      >
        {t('AppSidebar.allSources')}
      </button>

      {activeProviders.map((p) => {
        const info = providerInfo[p.type];
        const isActive = value === p.type;

        return (
          <button
            type="button"
            key={p.id}
            className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all', isActive ? 'bg-primary-soft border-primary text-primary' : 'bg-card border-border text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground')}
            onClick={() => onChange(isActive ? 'all' : p.type)}
          >
            <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ backgroundColor: getSourceColor(p.type) }} />
            {info?.title ?? p.type}
          </button>
        );
      })}
    </div>
  );
}
