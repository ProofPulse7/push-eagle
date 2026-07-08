import { Skeleton } from '@/components/ui/skeleton';

/** Full-screen skeleton for automation reminder editor routes. */
export function AutomationComposerSkeleton() {
  return (
    <div className="grid h-screen w-full grid-cols-1 lg:grid-cols-[minmax(0,_480px)_1fr]">
      <div className="flex h-screen flex-col border-r bg-card">
        <div className="shrink-0 border-b p-4">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="space-y-8 p-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-20 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
      <div className="flex h-screen items-center justify-center bg-background">
        <Skeleton className="h-1/2 w-1/2 max-w-md" />
      </div>
    </div>
  );
}
