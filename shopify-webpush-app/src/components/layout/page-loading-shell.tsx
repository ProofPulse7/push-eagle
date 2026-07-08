import { Skeleton } from '@/components/ui/skeleton';

export type PageSkeletonVariant =
  | 'dashboard'
  | 'campaigns'
  | 'automations'
  | 'subscribers'
  | 'settings'
  | 'segments'
  | 'plans'
  | 'opt-ins'
  | 'composer'
  | 'default';

const PageHeaderSkeleton = ({
  titleWidth = 'w-48',
  withActions = true,
}: {
  titleWidth?: string;
  withActions?: boolean;
}) => (
  <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
    <div className="space-y-2">
      <Skeleton className={`h-8 ${titleWidth}`} />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
    {withActions ? (
      <div className="flex gap-2">
        <Skeleton className="h-10 w-32 rounded-md" />
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>
    ) : null}
  </div>
);

const StatCardsSkeleton = ({ count = 4 }: { count?: number }) => (
  <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {Array.from({ length: count }).map((_, index) => (
      <Skeleton key={index} className="h-[140px] w-full rounded-xl" />
    ))}
  </div>
);

const ChartSkeleton = ({ tall = false }: { tall?: boolean }) => (
  <Skeleton className={`${tall ? 'h-[28rem]' : 'h-80'} w-full rounded-xl`} />
);

const TableSkeleton = ({ rows = 6 }: { rows?: number }) => (
  <div className="space-y-3 rounded-xl border border-border/80 p-4">
    <Skeleton className="h-10 w-full" />
    {Array.from({ length: rows }).map((_, index) => (
      <Skeleton key={index} className="h-12 w-full" />
    ))}
  </div>
);

export function resolvePageSkeletonVariant(pathname: string): PageSkeletonVariant {
  if (pathname === '/dashboard' || pathname === '/') {
    return 'dashboard';
  }
  if (pathname.startsWith('/campaigns/new')) {
    return 'composer';
  }
  if (/^\/automations\/[^/]+\/[^/]+\/edit$/.test(pathname)) {
    return 'composer';
  }
  if (pathname.startsWith('/campaigns')) {
    return 'campaigns';
  }
  if (pathname.startsWith('/automations')) {
    return 'automations';
  }
  if (pathname.startsWith('/subscribers')) {
    return 'subscribers';
  }
  if (pathname.startsWith('/settings')) {
    return 'settings';
  }
  if (pathname.startsWith('/segments')) {
    return 'segments';
  }
  if (pathname.startsWith('/plans')) {
    return 'plans';
  }
  if (pathname.startsWith('/opt-ins')) {
    return 'opt-ins';
  }
  return 'default';
}

export function RoutePageSkeleton({
  pathname = '/dashboard',
  variant,
}: {
  pathname?: string;
  variant?: PageSkeletonVariant;
}) {
  const resolved = variant ?? resolvePageSkeletonVariant(pathname);

  return (
    <div className="px-4 py-6 sm:px-6 md:px-8 md:py-8">
      {resolved === 'dashboard' ? (
        <>
          <PageHeaderSkeleton titleWidth="w-36" />
          <StatCardsSkeleton count={4} />
          <ChartSkeleton tall />
        </>
      ) : null}

      {resolved === 'campaigns' ? (
        <>
          <PageHeaderSkeleton titleWidth="w-44" />
          <StatCardsSkeleton count={3} />
          <TableSkeleton rows={8} />
        </>
      ) : null}

      {resolved === 'automations' ? (
        <>
          <PageHeaderSkeleton titleWidth="w-44" withActions={false} />
          <StatCardsSkeleton count={3} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-56 w-full rounded-xl" />
            ))}
          </div>
        </>
      ) : null}

      {resolved === 'subscribers' ? (
        <>
          <PageHeaderSkeleton titleWidth="w-40" withActions={false} />
          <StatCardsSkeleton count={4} />
          <ChartSkeleton />
          <Skeleton className="mt-8 h-96 w-full rounded-xl" />
        </>
      ) : null}

      {resolved === 'settings' ? (
        <>
          <PageHeaderSkeleton titleWidth="w-32" withActions={false} />
          <Skeleton className="mb-6 h-10 w-full max-w-md rounded-md" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-72 w-full rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
        </>
      ) : null}

      {resolved === 'segments' ? (
        <>
          <PageHeaderSkeleton titleWidth="w-36" />
          <Skeleton className="mb-8 h-40 w-full rounded-xl" />
          <TableSkeleton rows={5} />
        </>
      ) : null}

      {resolved === 'plans' ? (
        <>
          <PageHeaderSkeleton titleWidth="w-28" withActions={false} />
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-[420px] w-full rounded-xl" />
            <Skeleton className="h-[420px] w-full rounded-xl" />
          </div>
        </>
      ) : null}

      {resolved === 'opt-ins' ? (
        <>
          <PageHeaderSkeleton titleWidth="w-32" withActions={false} />
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
          <Skeleton className="mt-6 h-80 w-full rounded-xl" />
        </>
      ) : null}

      {resolved === 'composer' ? (
        <div className="grid h-[calc(100vh-4rem)] gap-4 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-full w-full rounded-xl" />
          <Skeleton className="h-full w-full rounded-xl" />
        </div>
      ) : null}

      {resolved === 'default' ? (
        <>
          <PageHeaderSkeleton />
          <StatCardsSkeleton count={4} />
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        </>
      ) : null}
    </div>
  );
}

/** @deprecated Use RoutePageSkeleton — kept for existing loading.tsx imports */
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
