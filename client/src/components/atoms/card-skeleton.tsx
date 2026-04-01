import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  variant?: 'default' | 'circular';
}

export function CardSkeleton({ variant = 'default' }: Props) {
  if (variant === 'circular') {
    return (
      <div className="flex flex-col items-center gap-1.5 sm:gap-2">
        <Skeleton className="aspect-square w-full rounded-full" />
        <div className="flex flex-col items-center gap-1 w-full px-1">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="hidden sm:block h-2.5 w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <Skeleton className="aspect-square w-full rounded-none" />
      <CardContent className="px-1.5 py-1 sm:px-2 sm:py-1.5">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="hidden sm:block h-2.5 w-1/2" />
        </div>
      </CardContent>
    </Card>
  );
}

interface GridProps {
  count?: number;
  variant?: 'default' | 'circular';
  gridClassName?: string;
}

export function CardSkeletonGrid({ count = 10, variant = 'default', gridClassName }: GridProps) {
  return (
    <div className={gridClassName ?? 'grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2 sm:gap-3'}>
      {Array.from({ length: count }, (_, i) => `skeleton-${i}`).map((id) => (
        <CardSkeleton key={id} variant={variant} />
      ))}
    </div>
  );
}
