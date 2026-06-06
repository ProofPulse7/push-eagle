import { Suspense } from 'react';

import { PageLoadingView } from '@/components/ui/loading-ui';
import { PlansPageContent } from './plans-page-content';

export default function PlansPage() {
  return (
    <Suspense fallback={<PageLoadingView title="Plans" description="Loading plans and billing…" />}>
      <PlansPageContent />
    </Suspense>
  );
}
