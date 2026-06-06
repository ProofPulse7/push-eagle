import { DashboardView } from '@/components/dashboard/dashboard-view';
import { persistShopCookie, resolveShopDomain } from '@/lib/server/resolve-shop';
import { ensureShopifyOAuthHandoff } from '@/lib/server/shopify-entry';

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;

  await ensureShopifyOAuthHandoff({
    searchParams: params,
    returnPath: '/dashboard',
  });

  const shopDomain = await resolveShopDomain(params);

  if (shopDomain && params.shop) {
    try {
      await persistShopCookie(shopDomain);
    } catch {
      // Cookie is optional.
    }
  }

  return <DashboardView />;
}
