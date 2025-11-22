import type { TrackProvider } from '@melody-manager/shared';
import { AlertCircle, CheckCircle2, Music, XCircle } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { useProviders } from '@/hooks/use-providers';

interface Props<T> {
  selectedProvider: TrackProvider | 'all';
  onProviderChange: (provider: TrackProvider | 'all') => void;
  items: T[];
  getItemProviderIds: (item: T) => string[];
}

export function TrackProviderFilter<T>({ selectedProvider, onProviderChange, items, getItemProviderIds }: Props<T>) {
  const { t } = useTranslation();
  const { data = [] } = useProviders({ category: 'track', enabled: true });
  const trackProviders = data as TrackProvider[];
  const getProviderCount = useCallback(
    (provider: TrackProvider) => {
      return items.filter((item) => {
        const providerIds = getItemProviderIds(item);
        return providerIds.includes(provider.id);
      }).length;
    },
    [items, getItemProviderIds],
  );

  const getProviderIcon = (provider: TrackProvider) => {
    if (!provider.enabled) {
      return <XCircle className="h-3 w-3" />;
    }
    if (!provider.config) {
      return <AlertCircle className="h-3 w-3" />;
    }
    return <CheckCircle2 className="h-3 w-3" />;
  };

  const getProviderStyles = (provider: TrackProvider, isSelected: boolean) => {
    const baseStyles = 'cursor-pointer transition-all hover:scale-105';
    const selectedStyles = isSelected ? 'ring-2 ring-primary ring-offset-2' : '';

    const colorStyles: Record<TrackProvider['name'], string> = {
      local: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 border-blue-500/20',
      youtube: 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 border-red-500/20',
      spotify: 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 border-green-500/20',
      soundcloud: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20 border-orange-500/20',
    };

    if (!colorStyles[provider.type]) {
      return `${baseStyles} ${selectedStyles} bg-gray-500/10 text-gray-600 dark:text-gray-400 hover:bg-gray-500/20 border-gray-500/20`;
    }

    return `${baseStyles} ${selectedStyles} ${colorStyles[provider.type]}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">{t('TrackProviderFilter.filterBy')}</span>

      <Badge variant={selectedProvider === 'all' ? 'default' : 'outline'} className="cursor-pointer transition-all hover:scale-105" onClick={() => onProviderChange('all')}>
        <Music className="h-3 w-3" />
        {t('TrackProviderFilter.all')} ({items.length})
      </Badge>

      {trackProviders.map((trackProvider) => (
        <Badge
          key={trackProvider.type}
          variant="outline"
          className={getProviderStyles(trackProvider, selectedProvider === trackProvider)}
          onClick={() => {
            if (trackProvider.enabled) {
              onProviderChange(trackProvider);
            }
          }}
        >
          {getProviderIcon(trackProvider)}
          {trackProvider.type} ({getProviderCount(trackProvider)})
        </Badge>
      ))}
    </div>
  );
}
