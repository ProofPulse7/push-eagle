import { Skeleton } from '@/components/ui/skeleton';

export const AutomationFlowStepsSkeleton = ({ count = 3 }: { count?: number }) => (
  <div className="max-w-md mx-auto w-full flex flex-col items-center gap-4">
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="w-full space-y-3">
        <Skeleton className="h-40 w-full rounded-xl" />
        {index < count - 1 ? <Skeleton className="mx-auto h-8 w-px" /> : null}
      </div>
    ))}
  </div>
);
