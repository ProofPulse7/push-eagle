'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { buildShopifyOAuthEntryUrl, normalizeShopInput } from '@/lib/client/shopify-auth';
import { fetchJsonWithShop } from '@/lib/client/api-fetch';
import { useShopDomain } from '@/hooks/use-shop-domain';

const SKIP_PATHS = ['/connect', '/login'];

const shouldSkip = (pathname: string) =>
  SKIP_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

export function ShopConnectGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shopFromHook = useShopDomain();
  const [status, setStatus] = useState<'loading' | 'ready' | 'needs_shop' | 'needs_auth'>('loading');
  const [shopInput, setShopInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const returnTo = useMemo(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    return window.location.href;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (shouldSkip(pathname)) {
      setStatus('ready');
      return;
    }

    let cancelled = false;

    const run = async () => {
      setStatus('loading');
      setError(null);

      const shop = shopFromHook;
      if (!shop) {
        if (!cancelled) {
          setStatus('needs_shop');
        }
        return;
      }

      try {
        const payload = await fetchJsonWithShop<{
          hasToken?: boolean;
          needsAuth?: boolean;
        }>('/api/integrations/shopify/auth-status', shop);

        if (cancelled) {
          return;
        }

        if (payload.hasToken) {
          setStatus('ready');
          return;
        }

        setStatus('needs_auth');
        window.location.assign(buildShopifyOAuthEntryUrl(shop, returnTo));
      } catch (checkError) {
        if (!cancelled) {
          setError(checkError instanceof Error ? checkError.message : 'Could not verify Shopify connection.');
          setStatus('needs_shop');
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [pathname, shopFromHook, returnTo]);

  const handleConnect = () => {
    const shop = normalizeShopInput(shopInput);
    if (!shop.endsWith('.myshopify.com')) {
      setError('Enter your store domain, e.g. your-store.myshopify.com');
      return;
    }

    window.location.assign(buildShopifyOAuthEntryUrl(shop, returnTo));
  };

  if (status === 'ready' || shouldSkip(pathname)) {
    return <>{children}</>;
  }

  if (status === 'loading' || status === 'needs_auth') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Connecting to Shopify</CardTitle>
            <CardDescription>
              {status === 'needs_auth'
                ? 'Redirecting you to Shopify to authorize Push Eagle…'
                : 'Checking your store connection…'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You need a valid Shopify install session before billing and store data can load.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect your Shopify store</CardTitle>
          <CardDescription>
            Push Eagle must be opened through Shopify so we can load your store data and process plan
            payments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="shop-domain">
              Store domain
            </label>
            <Input
              id="shop-domain"
              placeholder="your-store.myshopify.com"
              value={shopInput}
              onChange={(event) => setShopInput(event.target.value)}
            />
          </div>
          <Button className="w-full" onClick={handleConnect}>
            Continue with Shopify
          </Button>
          <p className="text-xs text-muted-foreground">
            Or open <strong>Apps → Push Eagle</strong> from your Shopify admin. Direct links without Shopify
            login cannot access billing or live store data.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
