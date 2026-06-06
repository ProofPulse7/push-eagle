import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { PageLoadingView } from '@/components/ui/loading-ui';
import { ensureShopifyOAuthHandoff } from '@/lib/server/shopify-entry';
import { PlansPageContent } from './plans-page-content';

type PlansPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlansPage({ searchParams }: PlansPageProps) {
  const params = await searchParams;
  const shop = Array.isArray(params.shop) ? params.shop[0] : params.shop;

  if (!shop) {
    redirect('/shopify-login');
  }

  await ensureShopifyOAuthHandoff({
    searchParams: params,
    returnPath: '/plans',
  });

  return (
    <Suspense fallback={<PageLoadingView title="Plans" description="Loading plans and billing…" />}>
      <PlansPageContent />
    </Suspense>
  );
}
