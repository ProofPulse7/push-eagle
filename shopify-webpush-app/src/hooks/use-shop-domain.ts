'use client';

import { useEffect, useState } from 'react';

import { useSettings } from '@/context/settings-context';

const SHOP_SESSION_KEY = 'pe_active_shop';

const persistShop = (shop: string) => {
  if (!shop || typeof window === 'undefined') {
    return;
  }

  try {
    sessionStorage.setItem(SHOP_SESSION_KEY, shop);
    localStorage.setItem('shopDomain', shop);
  } catch {
    // Ignore storage errors.
  }
};

const readShopFromBrowser = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  const queryShop = new URLSearchParams(window.location.search).get('shop');
  if (queryShop?.trim()) {
    const normalized = queryShop.trim().toLowerCase();
    persistShop(normalized);
    return normalized;
  }

  const cookieShop = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('pe_shop='))
    ?.slice('pe_shop='.length);

  if (cookieShop?.trim()) {
    const normalized = cookieShop.trim().toLowerCase();
    persistShop(normalized);
    return normalized;
  }

  try {
    const sessionShop = sessionStorage.getItem(SHOP_SESSION_KEY);
    if (sessionShop?.trim()) {
      return sessionShop.trim().toLowerCase();
    }
  } catch {
    // Ignore storage errors.
  }

  const stored = localStorage.getItem('shopDomain');
  return stored?.trim().toLowerCase() ?? '';
};

export function useShopDomain() {
  const { shopDomain: contextShop, setShopDomain } = useSettings();
  const [queryShop, setQueryShop] = useState(() => readShopFromBrowser());

  useEffect(() => {
    const syncShop = () => {
      const resolved = readShopFromBrowser();
      if (resolved) {
        setQueryShop(resolved);
        if (resolved !== contextShop) {
          setShopDomain(resolved);
        }
        return;
      }

      if (contextShop) {
        setQueryShop(contextShop);
        persistShop(contextShop);
      }
    };

    syncShop();

    window.addEventListener('focus', syncShop);
    document.addEventListener('visibilitychange', syncShop);

    return () => {
      window.removeEventListener('focus', syncShop);
      document.removeEventListener('visibilitychange', syncShop);
    };
  }, [contextShop, setShopDomain]);

  return (queryShop || contextShop || '').trim().toLowerCase();
}
