import { DashboardView } from '@/components/dashboard/dashboard-view';
import { ensureShopifyOfflineAccessToken } from '@/lib/server/billing/refresh-shopify-session';
import { persistShopCookie, resolveShopDomain } from '@/lib/server/resolve-shop';

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const shopDomain = await resolveShopDomain(params);

  if (shopDomain) {
    void ensureShopifyOfflineAccessToken(shopDomain).catch(() => {
      // Non-blocking background heal; avoid redirect loops with Remix /app entry.
    });

    try {
      await persistShopCookie(shopDomain);
    } catch {
      // Cookie is optional.
    }
  }

  return <DashboardView />;
};
