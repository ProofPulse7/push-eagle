import { DashboardView } from '@/components/dashboard/dashboard-view';
import { refreshShopifySessionFromRemixApp } from '@/lib/server/billing/refresh-shopify-session';
import { getShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';
import { persistShopCookie, resolveShopDomain } from '@/lib/server/resolve-shop';

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const shopDomain = await resolveShopDomain(params);

  if (shopDomain) {
    const hasToken = Boolean(await getShopifyOfflineAccessToken(shopDomain));
    if (!hasToken) {
      await refreshShopifySessionFromRemixApp(shopDomain);
    }

    try {
      await persistShopCookie(shopDomain);
    } catch {
      // Cookie is optional.
    }
  }

  return <DashboardView />;
}
