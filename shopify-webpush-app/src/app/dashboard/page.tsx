import { redirect } from 'next/navigation';

import { DashboardView } from '@/components/dashboard/dashboard-view';
import { buildShopifyAppConnectUrl } from '@/lib/server/billing/shopify-connect-url';
import { ensureShopifyOfflineAccessToken } from '@/lib/server/billing/refresh-shopify-session';
import { getShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';
import { persistShopCookie, resolveShopDomain } from '@/lib/server/resolve-shop';

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const shopDomain = await resolveShopDomain(params);

  if (shopDomain) {
    const existingToken = await getShopifyOfflineAccessToken(shopDomain);
    if (!existingToken) {
      redirect(buildShopifyAppConnectUrl(shopDomain));
    }

    await ensureShopifyOfflineAccessToken(shopDomain);

    try {
      await persistShopCookie(shopDomain);
    } catch {
      // Cookie is optional.
    }
  }

  return <DashboardView />;
}
