import type { ReactNode } from 'react';
import { useCardHeight } from '@/hooks/use-card-height';
import { cn } from '@/lib/utils';

interface Props<T> {
  items: readonly T[];
  getKey: (item: T) => string;
  children: (item: T) => ReactNode;
  // The column rule, as the grid should read it at every width.
  className?: string;
  // What a card is worth before one has ever been measured.
  fallbackHeight: number;
  // A card that belongs in the grid without being one of the items, such as the
  // one that creates a new playlist. It sits last so the measured card stays a
  // real one.
  trailing?: ReactNode;
}

// A grid of cards the browser is free to skip.
//
// Off-screen cards are not rendered, which is what makes a grid of a thousand
// of them cheap without a virtualiser in JS. The place each one holds is
// reserved with `contain-intrinsic-size`, and Chrome applies that height
// whether a card is being skipped or not: too small and the bottom of every
// card is cut off, too large and the grid grows gaps. So it is measured from
// one of the cards rather than guessed.
export function CardGrid<T>({ items, getKey, children, className, fallbackHeight, trailing }: Props<T>) {
  const [cardHeight, measureCard] = useCardHeight(fallbackHeight);
  const reserve = { containIntrinsicSize: `auto ${cardHeight}px` };

  return (
    <div className={cn('grid', className)}>
      {items.map((item, index) => (
        <div key={getKey(item)} ref={index === 0 ? measureCard : undefined} className="offscreen-skip" style={reserve}>
          {children(item)}
        </div>
      ))}
      {trailing && (
        <div className="offscreen-skip" style={reserve}>
          {trailing}
        </div>
      )}
    </div>
  );
}
