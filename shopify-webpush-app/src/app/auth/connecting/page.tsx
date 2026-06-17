'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { AppSetupScreen } from '@/components/ui/loading-ui';

export default function AuthConnectingPage() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const connectUrl = useMemo(() => {
    const url = new URL('/api/auth/connect', window.location.origin);
    const shop = searchParams.get('shop');
    const returnTo = searchParams.get('return_to');
    const host = searchParams.get('host');
    const embedded = searchParams.get('embedded');

    if (shop) {
      url.searchParams.set('shop', shop);
    }
    if (returnTo) {
      url.searchParams.set('return_to', returnTo);
    }
    if (host) {
      url.searchParams.set('host', host);
    }
    if (embedded) {
      url.searchParams.set('embedded', embedded);
    }

    return url.toString();
  }, [searchParams]);

  useEffect(() => {
    if (!searchParams.get('shop')) {
      setError('Missing shop. Open Push Eagle from Shopify Admin.');
      return;
    }

    window.location.replace(connectUrl);
  }, [connectUrl, searchParams]);

  return (
    <AppSetupScreen
      progress={35}
      stepLabel="Connecting your Shopify store…"
      error={error}
      onRetry={error ? () => window.location.replace(connectUrl) : undefined}
    />
  );
}
