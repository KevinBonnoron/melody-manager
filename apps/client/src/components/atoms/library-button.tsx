import { Heart, HeartOff, Undo2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { RatingValue } from '@/shared';

interface Props {
  value?: RatingValue;
  ready?: boolean;
  onLike: () => void;
  onUndislike: () => void;
}

export function LibraryButton({ value, ready = true, onLike, onUndislike }: Props) {
  const { t } = useTranslation();

  if (!ready) {
    return (
      <Button variant="outline" size="icon" className="h-9 w-9 opacity-50 sm:w-auto sm:px-3" disabled aria-hidden>
        <Heart className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">{t('Library.add')}</span>
      </Button>
    );
  }

  if (value === 'dislike') {
    return (
      <Button variant="outline" size="icon" className="group/library h-9 w-9 border-destructive/40 hover:border-input sm:w-auto sm:px-3" onClick={onUndislike} aria-label={t('Library.unignore')}>
        <HeartOff className="h-4 w-4 text-destructive group-hover/library:hidden sm:mr-2" />
        <Undo2 className="hidden h-4 w-4 group-hover/library:block sm:mr-2" />
        <span className="hidden sm:grid">
          <span className="[grid-area:1/1] text-destructive group-hover/library:invisible">{t('Library.ignored')}</span>
          <span className="invisible [grid-area:1/1] group-hover/library:visible">{t('Library.unignore')}</span>
        </span>
      </Button>
    );
  }

  if (value !== 'like') {
    return (
      <Button variant="outline" size="icon" className="h-9 w-9 sm:w-auto sm:px-3" onClick={onLike} aria-label={t('Library.add')}>
        <Heart className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">{t('Library.add')}</span>
      </Button>
    );
  }

  return (
    <Button variant="outline" size="icon" className="group/library h-9 w-9 text-primary hover:border-destructive hover:text-destructive sm:w-auto sm:px-3" onClick={onLike} aria-label={t('Library.remove')}>
      <Heart className="h-4 w-4 fill-current group-hover/library:hidden sm:mr-2" />
      <X className="hidden h-4 w-4 group-hover/library:block sm:mr-2" />
      <span className="hidden sm:grid">
        <span className="[grid-area:1/1] group-hover/library:invisible">{t('Library.in')}</span>
        <span className="invisible [grid-area:1/1] group-hover/library:visible">{t('Library.remove')}</span>
      </span>
    </Button>
  );
}
