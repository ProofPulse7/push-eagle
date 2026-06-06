import { redirect } from 'next/navigation';

import { DashboardView } from '@/components/dashboard/dashboard-view';
import { persistShopCookie, resolveShopDomain } from '@/lib/server/resolve-shop';

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const shopDomain = await resolveShopDomain(params);

  if (!shopDomain) {
    redirect('/shopify-login');
  }

  if (params.shop) {
    try {
      await persistShopCookie(shopDomain);
    } catch {
      // Cookie is optional; client hooks also read ?shop= from the URL.
    }
  }

  return <DashboardView />;
}
