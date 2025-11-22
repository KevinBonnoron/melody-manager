import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  variant?: 'default' | 'circular';
}

export function CardSkeleton({ variant = 'default' }: Props) {
  return (
    <Card className="overflow-hidden p-0">
      <Skeleton className={`aspect-square w-full ${variant === 'circular' ? 'mx-auto rounded-full m-4 w-[calc(100%-2rem)]' : 'rounded-none'}`} />
      <CardContent className="p-2 sm:p-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </CardContent>
    </Card>
  );
}

interface GridProps {
  count?: number;
  variant?: 'default' | 'circular';
}

export function CardSkeletonGrid({ count = 10, variant = 'default' }: GridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4">
      {Array.from({ length: count }, (_, i) => `skeleton-${i}`).map((id) => (
        <CardSkeleton key={id} variant={variant} />
      ))}
    </div>
  );
}
