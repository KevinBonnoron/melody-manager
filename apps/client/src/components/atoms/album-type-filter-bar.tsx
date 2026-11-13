import { useTranslation } from 'react-i18next';
import { albumTypeLabelKey } from '@/lib/album-type';
import { cn } from '@/lib/utils';
import { ALBUM_TYPES, type AlbumType } from '@/shared';

export type AlbumTypeFilter = AlbumType | 'all';

interface Props {
  value: AlbumTypeFilter;
  onChange: (value: AlbumTypeFilter) => void;
  /** Kinds actually present: a chip for a kind nothing has would only lead to an empty page. */
  available: ReadonlySet<AlbumType>;
}

export function AlbumTypeFilterBar({ value, onChange, available }: Props) {
  const { t } = useTranslation();
  if (available.size <= 1) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {(['all', ...ALBUM_TYPES.filter((type) => available.has(type))] as const).map((option) => (
        <button
          type="button"
          key={option}
          aria-pressed={value === option}
          className={cn('inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-all', value === option ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground')}
          onClick={() => onChange(option)}
        >
          {option === 'all' ? t('AlbumType.all') : t(albumTypeLabelKey(option))}
        </button>
      ))}
    </div>
  );
}
