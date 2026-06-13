import { Skeleton } from '@/components/ui/skeleton';

export function PageLoadingShell({
  titleWidth = 'w-48',
  statCards = 4,
}: {
  titleWidth?: string;
  statCards?: number;
}) {
  return (
    <div className="px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <div className="mb-8 space-y-2">
        <Skeleton className={`h-8 ${titleWidth}`} />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: statCards }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    </div>
  );
}
