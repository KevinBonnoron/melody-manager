import type { Genre, TrackProvider } from '@melody-manager/shared';
import { Music, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getProviderColor } from '@/lib/utils';

export interface SearchFilters {
  provider?: string;
  genre?: string;
}

export function hasActiveFilters(filters: SearchFilters): boolean {
  return !!(filters.provider || filters.genre);
}

interface Props {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  providers: TrackProvider[];
  genres: Genre[];
}

export function SearchFiltersBar({ filters, onChange, providers, genres }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 border-b px-3 py-2">
      {/* Provider chips */}
      {providers.length > 0 && (
        <div className="flex items-center gap-1.5">
          <Badge
            variant={!filters.provider ? 'default' : 'outline'}
            className="cursor-pointer transition-all hover:scale-105"
            role="button"
            tabIndex={0}
            aria-pressed={!filters.provider}
            onClick={() => onChange({ ...filters, provider: undefined })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onChange({ ...filters, provider: undefined });
              }
            }}
          >
            <Music className="h-3 w-3" />
            {t('TrackProviderFilter.all')}
          </Badge>
          {providers.map((p) => {
            const isSelected = filters.provider === p.id;
            const colorClass = getProviderColor(p.type, isSelected ? 'contrast' : 'default');
            return (
              <Badge
                key={p.id}
                variant="outline"
                className={`cursor-pointer capitalize transition-all hover:scale-105 ${colorClass} ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => onChange({ ...filters, provider: isSelected ? undefined : p.id })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onChange({ ...filters, provider: isSelected ? undefined : p.id });
                  }
                }}
              >
                {p.type}
              </Badge>
            );
          })}
        </div>
      )}

      {/* Genre select */}
      {genres.length > 0 && (
        <>
          {providers.length > 0 && <div className="h-4 w-px bg-border" />}
          <div className="flex items-center gap-1.5">
            <Select value={filters.genre ?? 'all'} onValueChange={(v) => onChange({ ...filters, genre: v === 'all' ? undefined : v })}>
              <SelectTrigger size="sm" className="h-6 gap-1 border-dashed text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('GlobalSearch.filters.allGenres')}</SelectItem>
                {genres.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filters.genre && (
              <button type="button" className="rounded-full p-0.5 hover:bg-muted transition-colors" aria-label={t('GlobalSearch.filters.clearGenre')} onClick={() => onChange({ ...filters, genre: undefined })}>
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
