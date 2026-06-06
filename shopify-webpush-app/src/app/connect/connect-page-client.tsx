'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { buildShopifyOAuthEntryUrl, normalizeShopInput } from '@/lib/client/shopify-auth';

export default function ConnectPageClient() {
  const searchParams = useSearchParams();
  const [shopInput, setShopInput] = useState(searchParams.get('shop') ?? '');
  const [error, setError] = useState<string | null>(null);

  const returnTo = searchParams.get('return_to') || undefined;

  const handleConnect = () => {
    const shop = normalizeShopInput(shopInput);
    if (!shop.endsWith('.myshopify.com')) {
      setError('Enter your store domain, e.g. your-store.myshopify.com');
      return;
    }

    window.location.assign(buildShopifyOAuthEntryUrl(shop, returnTo));
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Connect Push Eagle to Shopify</CardTitle>
          <CardDescription>
            Enter your store domain to sign in with Shopify. This creates the secure session required for
            campaigns, automations, and plan billing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="shop-domain">
              Shopify store domain
            </label>
            <Input
              id="shop-domain"
              placeholder="your-store.myshopify.com"
              value={shopInput}
              onChange={(event) => setShopInput(event.target.value)}
            />
          </div>
          <Button className="w-full" size="lg" onClick={handleConnect}>
            Continue with Shopify
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
