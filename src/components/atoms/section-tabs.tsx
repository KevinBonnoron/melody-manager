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

// Design: .lib-tabs / .lib-tab, 13px, 2px bottom border taking the accent when
// active, overlapping the container border.
export function SectionTabs<T extends string>({ tabs, active, onChange }: Props<T>) {
  return (
    <div className="mb-3.5 flex gap-1 border-b">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button key={tab.id} type="button" onClick={() => onChange(tab.id)} className={cn('-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors', isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {tab.label}
            {tab.count !== undefined && <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none', isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
