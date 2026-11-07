import { cn } from '@/lib/utils';

/**
 * Under a control that is doing something: a panel it has open, or a setting it
 * has turned on. Given no state of its own it follows the one a dropdown puts
 * on its trigger, so a menu needs nothing lifted out of it to be marked.
 */
export function ControlDot({ shown }: { shown?: boolean }) {
  const visibility = shown === undefined ? 'opacity-0 group-data-[state=open]:opacity-100' : shown ? 'opacity-100' : 'opacity-0';

  return <span aria-hidden className={cn('pointer-events-none absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary transition-opacity', visibility)} />;
}
