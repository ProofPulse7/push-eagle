import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { PageLoadingView } from '@/components/ui/loading-ui';
import { buildShopifyAppConnectUrl } from '@/lib/server/billing/shopify-connect-url';
import { getShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';
import { resolveShopDomain } from '@/lib/server/resolve-shop';
import { PlansPageContent } from './plans-page-content';

type PlansPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlansPage({ searchParams }: PlansPageProps) {
  const params = await searchParams;
  const shopDomain = await resolveShopDomain(params);

  if (shopDomain && !(await getShopifyOfflineAccessToken(shopDomain))) {
    redirect(buildShopifyAppConnectUrl(shopDomain));
  }

  return (
    <Suspense fallback={<PageLoadingView title="Plans" description="Loading plans and billing…" />}>
      <PlansPageContent />
    </Suspense>
  );
}
