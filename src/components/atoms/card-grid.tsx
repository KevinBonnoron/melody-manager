import type { ReactNode } from 'react';
import { useCardHeight } from '@/hooks/use-card-height';
import { cn } from '@/lib/utils';

interface Props<T> {
  items: readonly T[];
  getKey: (item: T) => string;
  children: (item: T) => ReactNode;
  className?: string;
  fallbackHeight: number;
  trailing?: ReactNode;
}

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
