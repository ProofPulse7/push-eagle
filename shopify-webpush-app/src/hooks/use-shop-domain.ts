'use client';

import { useEffect, useState } from 'react';

import { useSettings } from '@/context/settings-context';
import { readShopDomainSync } from '@/lib/client/read-shop-domain';

export function useShopDomain() {
  const { shopDomain: contextShop, setShopDomain } = useSettings();
  const [browserShop, setBrowserShop] = useState(() => readShopDomainSync());

  useEffect(() => {
    const resolved = readShopDomainSync();
    if (resolved) {
      setBrowserShop(resolved);
    }
    if (resolved && resolved !== contextShop) {
      setShopDomain(resolved);
    }
  }, [contextShop, setShopDomain]);

  return (browserShop || contextShop || readShopDomainSync() || '').trim().toLowerCase();
}
