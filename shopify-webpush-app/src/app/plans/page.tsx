import { Suspense } from 'react';

import { PageLoadingView } from '@/components/ui/loading-ui';
import { redirectToShopifyConnectIfNeeded } from '@/lib/server/billing/redirect-to-shopify-connect';
import { persistShopCookie, resolveShopDomain } from '@/lib/server/resolve-shop';

import { PlansPageContent } from './plans-page-content';

type PlansPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlansPage({ searchParams }: PlansPageProps) {
  const params = await searchParams;
  const shopDomain = await resolveShopDomain(params);

  await redirectToShopifyConnectIfNeeded({
    shopDomain,
    returnPath: '/plans',
    searchParams: params,
  });

  if (shopDomain) {
    try {
      await persistShopCookie(shopDomain);
    } catch {
      // Cookie is optional.
    }
  }

  return (
    <Suspense fallback={<PageLoadingView title="Plans" description="Loading plans and billing…" />}>
      <PlansPageContent />
    </Suspense>
  );
}
