import { redirect } from 'next/navigation';

import { DashboardView } from '@/components/dashboard/dashboard-view';
import { ensureShopifyOAuthHandoff } from '@/lib/server/shopify-entry';

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const shop = Array.isArray(params.shop) ? params.shop[0] : params.shop;

  if (!shop) {
    redirect('/shopify-login');
  }

  await ensureShopifyOAuthHandoff({
    shop: params.shop,
    host: params.host,
    returnPath: '/dashboard',
  });

  return <DashboardView />;
}
