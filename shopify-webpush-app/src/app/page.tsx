import { redirect } from 'next/navigation';

type RootPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RootPage({ searchParams }: RootPageProps) {
  const params = await searchParams;
  const shop = Array.isArray(params.shop) ? params.shop[0] : params.shop;

  if (shop) {
    redirect(`/dashboard?shop=${encodeURIComponent(shop)}`);
  }

  redirect('/dashboard');
}
