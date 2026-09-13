import { Heart, HeartOff, Undo2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { RatingValue } from '@/shared';

interface Props {
  value?: RatingValue;
  // False while the ratings are still loading: the button holds still rather
  // than saying "not added" and flipping a second later.
  ready?: boolean;
  onLike: () => void;
  onUndislike: () => void;
}

// The same gesture as the heart on a track row, for an album, an artist or a
// playlist: they all write the same rating, so they say the same thing. All
// three states show here, a disliked album included, which otherwise only
// admitted it from inside the menu.
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

  // A button showing a state undoes that state. Jumping straight from ignored
  // to liked skips the neutral one, which is where someone taking back an
  // "ignore" means to land.
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

  // The active state keeps its border and tells on hover what pressing again
  // undoes, with both labels sharing one grid cell so nothing beside it moves.
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
