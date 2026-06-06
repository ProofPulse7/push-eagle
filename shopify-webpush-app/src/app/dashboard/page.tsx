import { redirect } from 'next/navigation';

import { DashboardView } from '@/components/dashboard/dashboard-view';
import { buildShopifyAppConnectUrl } from '@/lib/server/billing/shopify-connect-url';
import { ensureShopifyOfflineAccessToken } from '@/lib/server/billing/refresh-shopify-session';
import { getValidatedShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';
import { persistShopCookie, resolveShopDomain } from '@/lib/server/resolve-shop';

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const shopDomain = await resolveShopDomain(params);

  if (shopDomain) {
    const hasValidToken = await getValidatedShopifyOfflineAccessToken(shopDomain);

    if (!hasValidToken) {
      redirect(buildShopifyAppConnectUrl(shopDomain));
    }

    void ensureShopifyOfflineAccessToken(shopDomain).catch(() => {
      // Non-blocking background refresh.
    });

    try {
      await persistShopCookie(shopDomain);
    } catch {
      // Cookie is optional.
    }
  }

  return <DashboardView />;
}
