import type { ReactNode } from 'react';

interface Props {
  media: ReactNode;
  title: string;
  subtitle: ReactNode;
  description?: string;
  actions: ReactNode;
  menu?: ReactNode;
}

export function PageHeader({ media, title, subtitle, description, actions, menu }: Props) {
  return (
    <div className="mb-8 flex flex-row gap-4 md:gap-6">
      <div className="h-20 w-20 shrink-0 md:h-32 md:w-32 xl:h-40 xl:w-40">{media}</div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 md:justify-end md:gap-2">
        <h1 className="line-clamp-2 text-2xl font-bold leading-tight md:text-4xl xl:text-5xl">{title}</h1>
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground md:text-base">{subtitle}</p>
        {description && <p className="hidden line-clamp-2 text-sm text-muted-foreground md:block">{description}</p>}

        <div className="mt-1 flex items-center gap-2 md:mt-2 md:gap-3">
          {actions}
          {menu}
        </div>
      </div>
    </div>
  );
}
