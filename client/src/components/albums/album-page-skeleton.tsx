import { Skeleton } from '@/components/ui/skeleton';

export function AlbumPageSkeleton() {
  return (
    <>
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 xl:gap-x-8 xl:gap-y-4 mb-8">
        <div className="row-span-2">
          <Skeleton className="w-32 h-32 xl:w-64 xl:h-64 rounded-xl" />
        </div>

        <div className="flex flex-col justify-end">
          <Skeleton className="h-3.5 w-12 mb-2" />
          <Skeleton className="h-8 w-56 xl:h-11 xl:w-80" />
          <Skeleton className="h-5 w-24 mt-2 xl:mt-4" />
        </div>

        <div className="col-span-2 xl:col-span-1 flex items-center gap-3 xl:gap-4">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>

      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => {
          const key = `skeleton-${i}`;
          return <Skeleton key={key} className="h-12 w-full rounded-md" />;
        })}
      </div>
    </>
  );
}
