import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface SectionTab<T extends string> {
  id: T;
  label: string;
  count?: number;
}

interface Props<T extends string> {
  tabs: SectionTab<T>[];
  active: T;
  onChange: (id: T) => void;
}

export function SectionTabs<T extends string>({ tabs, active, onChange }: Props<T>) {
  const rowRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // A tab chosen by the address can sit past the edge of a scrolled row, and a
  // page opened that way would not show which one it is on. Only the row
  // scrolls: bringing the tab into view any other way can move the page too.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the tab to show changes with active, read through the ref
  useEffect(() => {
    const row = rowRef.current;
    const tab = activeRef.current;
    if (!row || !tab) {
      return;
    }
    const edges = row.getBoundingClientRect();
    const place = tab.getBoundingClientRect();
    if (place.left < edges.left) {
      row.scrollLeft -= edges.left - place.left;
    } else if (place.right > edges.right) {
      row.scrollLeft += place.right - edges.right;
    }
  }, [active]);

  return (
    // Scrolls rather than overflowing: a row wider than a phone widens the
    // layout viewport, and everything fixed to the bottom of it, the player
    // bar first, ends up below the screen. A scroll container would clip a
    // tab's underline drawn over a border, so the baseline is a shadow the
    // active tab paints over.
    <div ref={rowRef} className="mb-3.5 flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={isActive ? activeRef : undefined}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn('flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors', isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            {tab.label}
            {tab.count !== undefined && <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none', isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
