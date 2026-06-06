import { redirect } from 'next/navigation';

import { DashboardView } from '@/components/dashboard/dashboard-view';
import { ensureShopifyOAuthHandoff, persistShopCookie } from '@/lib/server/shopify-entry';
import { normalizeShopDomain } from '@/lib/server/shop-context';

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
    searchParams: params,
    returnPath: '/dashboard',
  });

  try {
    await persistShopCookie(normalizeShopDomain(shop));
  } catch {
    // Shop cookie is optional; query param remains the primary source.
  }

  return <DashboardView />;
}
