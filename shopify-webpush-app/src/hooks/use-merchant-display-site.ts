'use client';

import { useMemo } from 'react';

import { useSettings } from '@/context/settings-context';
import { resolveMerchantDisplaySiteName } from '@/lib/client/merchant-display-site';

export function useMerchantDisplaySiteName() {
  const { shopDomain, storeUrl } = useSettings();

  return useMemo(
    () => resolveMerchantDisplaySiteName(storeUrl, shopDomain),
    [shopDomain, storeUrl],
  );
}
