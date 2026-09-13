import type { ReactNode } from 'react';

interface Props {
  // The artwork: a round portrait for an artist, a square cover for an album.
  media: ReactNode;
  title: string;
  // One line, everything the page is worth saying about itself in passing.
  subtitle: ReactNode;
  // Rare and optional, never at the expense of the three parts above it.
  description?: string;
  actions: ReactNode;
  menu?: ReactNode;
}

// The header every library page wears: artwork, title, one subtitle, one row of
// actions. Written once so the artist and album pages cannot drift apart again.
export function PageHeader({ media, title, subtitle, description, actions, menu }: Props) {
  return (
    <div className="mb-8 flex flex-row gap-4 md:gap-6">
      <div className="h-20 w-20 shrink-0 md:h-32 md:w-32 xl:h-40 xl:w-40">{media}</div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 md:justify-end md:gap-2">
        <h1 className="line-clamp-2 text-2xl font-bold leading-tight md:text-4xl xl:text-5xl">{title}</h1>
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground md:text-base">{subtitle}</p>
        {description && <p className="hidden line-clamp-2 text-sm text-muted-foreground md:block">{description}</p>}

        {/* The menu closes the row rather than hugging the far edge: it holds the
            rest of these same actions, and pushed to the right of a wide header
            it sat half a screen away from them. */}
        <div className="mt-1 flex items-center gap-2 md:mt-2 md:gap-3">
          {actions}
          {menu}
        </div>
      </div>
    </div>
  );
}
