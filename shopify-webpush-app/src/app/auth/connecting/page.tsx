import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

type AuthConnectingPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const pickParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function AuthConnectingPage({ searchParams }: AuthConnectingPageProps) {
  const params = await searchParams;
  const shop = pickParam(params.shop);

  if (!shop) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Missing shop. Open Push Eagle from Shopify Admin.
      </main>
    );
  }

  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host') ?? 'localhost';
  const protocol = headerList.get('x-forwarded-proto') ?? 'https';
  const connectUrl = new URL('/api/auth/connect', `${protocol}://${host}`);

  connectUrl.searchParams.set('shop', shop);

  const returnTo = pickParam(params.return_to);
  const adminHost = pickParam(params.host);
  const embedded = pickParam(params.embedded);

  if (returnTo) {
    connectUrl.searchParams.set('return_to', returnTo);
  }
  if (adminHost) {
    connectUrl.searchParams.set('host', adminHost);
  }
  if (embedded) {
    connectUrl.searchParams.set('embedded', embedded);
  }

  redirect(connectUrl.toString());
}
