import { redirect } from 'next/navigation';

import { resolveShopDomain } from '@/lib/server/resolve-shop';

type RootPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RootPage({ searchParams }: RootPageProps) {
  const params = await searchParams;
  const shopDomain = await resolveShopDomain(params);

  if (shopDomain) {
    redirect(`/dashboard?shop=${encodeURIComponent(shopDomain)}`);
  }

  redirect('/shopify-login');
}
