import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LEGAL_LINKS } from '@/lib/client/legal-links';

const ROOT_APP_URL = (process.env.SHOPIFY_ROOT_APP_URL || 'https://push-eagle.vercel.app').replace(
  /\/$/,
  '',
);

type RootPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RootPage({ searchParams }: RootPageProps) {
  const params = await searchParams;
  const shop = Array.isArray(params.shop) ? params.shop[0] : params.shop;

  if (shop) {
    const target = new URL('/dashboard', 'http://local');
    target.searchParams.set('shop', shop);
    const host = Array.isArray(params.host) ? params.host[0] : params.host;
    const embedded = Array.isArray(params.embedded) ? params.embedded[0] : params.embedded;
    if (host) {
      target.searchParams.set('host', host);
    }
    if (embedded || host) {
      target.searchParams.set('embedded', embedded || '1');
    }
    redirect(`${target.pathname}${target.search}`);
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-medium uppercase tracking-wide text-primary">Push Eagle for Shopify</p>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
              Web push campaigns that feel instant
            </h1>
            <p className="text-lg text-muted-foreground">
              Connect your Shopify store, collect browser subscribers, and run web push campaigns from your
              dashboard.
            </p>
          </div>

          <ul className="space-y-3 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Storefront opt-in.</strong> Use the theme extension block to
              collect push subscribers on storefront pages.
            </li>
            <li>
              <strong className="text-foreground">Campaign delivery.</strong> Send targeted notifications with
              Firebase-backed delivery and click tracking.
            </li>
            <li>
              <strong className="text-foreground">Attribution analytics.</strong> Measure campaign impact with
              conversion attribution from Shopify orders.
            </li>
          </ul>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href={`${ROOT_APP_URL}/app`}
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Open from Shopify Admin
            </Link>
            <a
              href={LEGAL_LINKS.supportEmail}
              className="inline-flex h-11 items-center justify-center rounded-md border border-border px-6 text-sm font-medium hover:bg-muted/60"
            >
              Contact support
            </a>
          </div>
        </div>

        <footer className="mt-16 border-t pt-6 text-center text-xs text-muted-foreground">
          <p>
            <Link href={LEGAL_LINKS.privacyPolicy} className="underline underline-offset-2">
              Privacy policy
            </Link>
            {' · '}
            <Link href={LEGAL_LINKS.termsOfService} className="underline underline-offset-2">
              Terms of service
            </Link>
            {' · '}
            <a href={LEGAL_LINKS.supportEmail} className="underline underline-offset-2">
              Support
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
