import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';

export function FlowNotificationCardSkeleton() {
  return (
    <Card className="border-l-4 border-l-border">
      <CardHeader className="p-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-9 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </CardHeader>
      <CardContent className="p-3">
        <Skeleton className="h-36 w-full rounded-lg" />
      </CardContent>
      <CardFooter className="p-2">
        <Skeleton className="h-9 w-full rounded-md" />
      </CardFooter>
    </Card>
  );
}

export function FlowNotificationListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <FlowNotificationCardSkeleton key={index} />
      ))}
    </>
  );
}
