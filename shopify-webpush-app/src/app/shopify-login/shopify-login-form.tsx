'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buildShopifyOAuthEntryUrl, normalizeShopInput } from '@/lib/client/shopify-auth';

const NavLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 22c1.1 0 2-.9 2-2H10c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
  </svg>
);

export function ShopifyLoginForm() {
  const [shopInput, setShopInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = () => {
    const shop = normalizeShopInput(shopInput);
    if (!shop.endsWith('.myshopify.com')) {
      setError('Enter your Shopify store domain, e.g. your-store.myshopify.com');
      return;
    }

    const returnTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/dashboard?shop=${encodeURIComponent(shop)}`
        : undefined;

    window.location.assign(buildShopifyOAuthEntryUrl(shop, returnTo));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f6f7] p-6">
      <div className="w-full max-w-[420px] space-y-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#111827] text-white shadow-lg">
          <NavLogo className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-[#202223]">Shopify Store Log in</h1>
          <p className="text-sm text-[#6d7175]">Shopify subdomain</p>
        </div>

        <div className="space-y-3 text-left">
          <Input
            className="h-12 border-[#c9cccf] bg-white text-base"
            placeholder="your-store.myshopify.com"
            value={shopInput}
            onChange={(event) => {
              setShopInput(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleLogin();
              }
            }}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button
            className="h-12 w-full bg-[#008060] text-base font-semibold hover:bg-[#006e52]"
            onClick={handleLogin}
          >
            Login
          </Button>
        </div>

        <p className="text-xs text-[#6d7175]">
          Opened from Shopify admin? Use <strong>Apps → Push Eagle</strong> for one-click access.
        </p>
      </div>
    </div>
  );
}
