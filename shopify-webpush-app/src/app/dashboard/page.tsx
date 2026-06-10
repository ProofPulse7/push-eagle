import { DashboardView } from '@/components/dashboard/dashboard-view';
import { ShopifyConnectBreakout } from '@/components/shopify/shopify-connect-breakout';
import { env } from '@/lib/config/env';
import { appendShopifyAdminParams } from '@/lib/server/billing/shopify-admin-params';
import { buildShopifyAppConnectUrl } from '@/lib/server/billing/shopify-connect-url';
import { redirectToShopifyConnectIfNeeded } from '@/lib/server/billing/redirect-to-shopify-connect';
import { ensureShopifyOfflineAccessToken } from '@/lib/server/billing/refresh-shopify-session';
import { getValidatedShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';
import { persistShopCookie, resolveShopDomain } from '@/lib/server/resolve-shop';

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const pickParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const shopDomain = await resolveShopDomain(params);

  if (shopDomain) {
    const token = await getValidatedShopifyOfflineAccessToken(shopDomain);
    const embedded = pickParam(params.embedded) === '1';

    if (!token && embedded) {
      const returnTo = new URL('/dashboard', env.NEXT_PUBLIC_APP_URL);
      returnTo.searchParams.set('shop', shopDomain);
      returnTo.searchParams.set('oauth_attempt', '1');
      appendShopifyAdminParams(returnTo, params, { includeShop: false });

      const connectTarget = new URL(buildShopifyAppConnectUrl(shopDomain, params));
      connectTarget.searchParams.set('return_to', returnTo.toString());

      return <ShopifyConnectBreakout connectUrl={connectTarget.toString()} />;
    }
  }

  await redirectToShopifyConnectIfNeeded({
    shopDomain,
    returnPath: '/dashboard',
    searchParams: params,
  });

  if (shopDomain) {
    void ensureShopifyOfflineAccessToken(shopDomain).catch(() => {
      // Non-blocking background heal after OAuth entry.
    });

    try {
      await persistShopCookie(shopDomain);
    } catch {
      // Cookie is optional.
    }
  }

  return <DashboardView />;
}
