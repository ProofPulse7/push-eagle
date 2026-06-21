'use client';

import { useEffect, useState } from 'react';

import { usePersistRestored } from '@/components/providers/query-provider';
import { useShopDomain } from '@/hooks/use-shop-domain';

/** True once the client has resolved shop context and restored cached queries. */
export function useShopReady() {
  const shop = useShopDomain();
  const isRestored = usePersistRestored();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return {
    shop,
    isReady: mounted && isRestored && Boolean(shop),
    isResolving: !mounted || !isRestored || !shop,
  };
};
