'use client';

import { useLayoutEffect } from 'react';

type ShopifyConnectBreakoutProps = {
  connectUrl: string;
};

export function ShopifyConnectBreakout({ connectUrl }: ShopifyConnectBreakoutProps) {
  useLayoutEffect(() => {
    const topWindow = window.top ?? window;
    topWindow.location.replace(connectUrl);
  }, [connectUrl]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm text-muted-foreground">Opening Push Eagle to connect your store…</p>
      <a className="text-sm font-medium text-primary underline" href={connectUrl} target="_top" rel="noopener noreferrer">
        Continue in a new window
      </a>
    </div>
  );
}
